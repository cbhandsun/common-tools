"use strict";

const fs = require("fs");
const path = require("path");
const { readImageSize } = require("../lib/image-size");
const { readPng, writePng, cropPng } = require("../lib/png");

module.exports = async function compareThresholds(input, context = {}) {
  const textOcrStartedAt = Date.now();
  const textCoverage = await computeTextCoverage(input, context);
  const textOcrMs = Date.now() - textOcrStartedAt;
  const layout = summarizeLayoutEvidence(input.ir, input.render);
  const summary = {
    ...(input.diff?.summary || {}),
    ...(typeof input.diff?.summary?.layoutMeanIoU === "number" ? {} : { layoutMeanIoU: layout.layoutMeanIoU }),
    ...(typeof input.diff?.summary?.maxCriticalOffsetPt === "number" ? {} : { maxCriticalOffsetPt: layout.maxCriticalOffsetPt }),
    ...(typeof textCoverage?.summary?.textCoverage === "number"
      ? { textCoverage: textCoverage.summary.textCoverage }
      : {})
  };
  const thresholds = input.thresholds || {};
  const geometry = summarizeGeometry(input.ir);
  const editability = summarizeEditability(input.ir);
  const textCoverageRequired = typeof thresholds.textCoverage === "number"
    && isRealTextOcrEnabled(context);
  const layoutRequired = typeof thresholds.layoutMeanIoU === "number"
    && layout.comparedObjects > 0;
  const criticalOffsetRequired = typeof thresholds.maxCriticalOffsetPt === "number"
    && layout.comparedObjects > 0;
  const checks = [
    {
      name: "pixelDiffRatio",
      actual: summary.pixelDiffRatio,
      threshold: thresholds.pixelDiffRatio,
      required: typeof thresholds.pixelDiffRatio === "number",
      passed: typeof thresholds.pixelDiffRatio !== "number"
        || (typeof summary.pixelDiffRatio === "number" && summary.pixelDiffRatio <= thresholds.pixelDiffRatio)
    },
    {
      name: "foregroundMissingRatio",
      actual: summary.foregroundMissingRatio,
      threshold: thresholds.foregroundMissingRatio,
      required: typeof thresholds.foregroundMissingRatio === "number",
      passed: typeof thresholds.foregroundMissingRatio !== "number"
        || (typeof summary.foregroundMissingRatio === "number" && summary.foregroundMissingRatio <= thresholds.foregroundMissingRatio)
    },
    {
      name: "layoutMeanIoU",
      actual: summary.layoutMeanIoU,
      threshold: thresholds.layoutMeanIoU,
      required: layoutRequired,
      passed: layoutRequired
        ? (typeof summary.layoutMeanIoU === "number" && summary.layoutMeanIoU >= thresholds.layoutMeanIoU)
        : (typeof summary.layoutMeanIoU !== "number" || summary.layoutMeanIoU >= thresholds.layoutMeanIoU)
    },
    {
      name: "textCoverage",
      actual: summary.textCoverage,
      threshold: thresholds.textCoverage,
      required: textCoverageRequired,
      passed: textCoverageRequired
        ? (typeof summary.textCoverage === "number" && summary.textCoverage >= thresholds.textCoverage)
        : (typeof summary.textCoverage !== "number" || summary.textCoverage >= thresholds.textCoverage)
    },
    {
      name: "maxCriticalOffsetPt",
      actual: summary.maxCriticalOffsetPt,
      threshold: thresholds.maxCriticalOffsetPt,
      required: criticalOffsetRequired,
      passed: criticalOffsetRequired
        ? (typeof summary.maxCriticalOffsetPt === "number" && summary.maxCriticalOffsetPt <= thresholds.maxCriticalOffsetPt)
        : (typeof summary.maxCriticalOffsetPt !== "number" || summary.maxCriticalOffsetPt <= thresholds.maxCriticalOffsetPt)
    },
    {
      name: "maxOutOfBoundsPt",
      actual: geometry.maxOutOfBoundsPt,
      threshold: thresholds.maxOutOfBoundsPt,
      required: typeof thresholds.maxOutOfBoundsPt === "number",
      passed: typeof thresholds.maxOutOfBoundsPt !== "number" || geometry.maxOutOfBoundsPt <= thresholds.maxOutOfBoundsPt
    },
    {
      name: "maxImageAspectRatioDelta",
      actual: geometry.maxImageAspectRatioDelta,
      threshold: thresholds.maxImageAspectRatioDelta,
      required: typeof thresholds.maxImageAspectRatioDelta === "number",
      passed: typeof thresholds.maxImageAspectRatioDelta !== "number"
        || geometry.maxImageAspectRatioDelta <= thresholds.maxImageAspectRatioDelta
    },
    {
      name: "maxRasterImageAreaRatio",
      // Decorative background underlays are an intentional fidelity fallback.
      // Keep the total ratio for visibility, but gate only unexplained raster area.
      actual: editability.actionableRasterImageAreaRatio,
      threshold: thresholds.maxRasterImageAreaRatio,
      required: typeof thresholds.maxRasterImageAreaRatio === "number",
      passed: typeof thresholds.maxRasterImageAreaRatio !== "number"
        || editability.actionableRasterImageAreaRatio <= thresholds.maxRasterImageAreaRatio
    }
  ];
  const requiredChecks = checks.filter((check) => check.required);
  const missingOptionalMetrics = checks
    .filter((check) => !check.required && typeof check.actual !== "number")
    .map((check) => check.name);
  return {
    ok: true,
    data: {
      provider: "compare-thresholds",
      metricSource: input.diff?.provider || "unknown",
      iteration: input.iteration,
      passed: requiredChecks.every((check) => check.passed),
      checks,
      summary,
      textCoverage,
      layout,
      editability,
      geometry,
      timings: { textOcrMs },
      findings: checks
        .filter((check) => !check.passed || typeof check.actual !== "number")
        .map((check) => ({
          severity: check.required ? "error" : "warning",
          metric: check.name,
          message: typeof check.actual === "number"
            ? `${check.name} is outside threshold.`
            : missingMetricMessage(check.name, { textCoverage, layout })
        })),
      warning: missingOptionalMetrics.length > 0
        ? `Missing optional metric(s): ${missingOptionalMetrics.join(", ")}.`
        : null
    }
  };
};

function isRealTextOcrEnabled(context = {}) {
  const textOcr = context.config?.textOcr || {};
  if (textOcr.enabled !== true) return false;
  const adapterPath = textOcr.adapter || context.config?.adapters?.ocr || "";
  return Boolean(adapterPath && !/placeholder/i.test(adapterPath));
}

function missingMetricMessage(metric, state = {}) {
  if (metric === "textCoverage") {
    const reason = state.textCoverage?.reason || state.textCoverage?.error || null;
    return reason
      ? `textCoverage is unavailable: ${reason}`
      : "textCoverage is not produced because no real OCR adapter is configured.";
  }
  if (metric === "layoutMeanIoU" || metric === "maxCriticalOffsetPt") {
    return state.layout?.comparedObjects > 0
      ? `${metric} is unavailable even though layout evidence exists.`
      : `${metric} is not produced because no comparable evidenceBox objects were found.`;
  }
  return `${metric} is not produced by the current diff adapter.`;
}

function summarizeLayoutEvidence(ir, render = {}) {
  const items = [];
  const renderedPages = new Map((render?.renderedPages || []).map((page) => [page.pageIndex, page]));
  const renderedImages = new Map();
  for (const page of ir?.pages || []) {
    for (const item of collectItems(page)) {
      if ((item.type || "").toLowerCase() === "line") continue;
      // OCR can split one visual label into several fragments. When a
      // semantic rebuilder deliberately merges those fragments, retain the
      // raw OCR evidence but compare layout against its explicit canonical
      // placement instead of treating the old fragment as a visual target.
      const expected = layoutExpectedBox(item);
      if (!isBox(item.box) || !isBox(expected)) continue;
      const rendered = renderedPages.get(page.pageIndex);
      const containerEvidence = boxIou(item.box, expected) >= 0.98;
      const actual = containerEvidence
        ? item.box
        : (resolveMeasuredLayoutBox(item, rendered, ir.slideSize, renderedImages) || item.box);
      const iou = boxIou(actual, expected);
      const offset = centerOffset(actual, expected);
      items.push({
        pageIndex: page.pageIndex,
        elementId: item.id,
        type: item.type,
        measurement: actual === item.box ? "container-box" : "rendered-text-ink",
        expectedBox: roundedBox(expected),
        actualBox: roundedBox(actual),
        iou,
        centerOffsetPt: offset
      });
    }
  }
  if (items.length === 0) {
    return {
      provider: "layout-evidence",
      layoutMeanIoU: null,
      maxCriticalOffsetPt: null,
      comparedObjects: 0,
      worstObjects: []
    };
  }
  const layoutMeanIoU = items.reduce((sum, item) => sum + item.iou, 0) / items.length;
  const maxCriticalOffsetPt = Math.max(...items.map((item) => item.centerOffsetPt));
  return {
    provider: "layout-evidence",
    layoutMeanIoU: round(layoutMeanIoU),
    maxCriticalOffsetPt: round(maxCriticalOffsetPt),
    comparedObjects: items.length,
    worstObjects: items
      .slice()
      .sort((a, b) => a.iou - b.iou || b.centerOffsetPt - a.centerOffsetPt)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        iou: round(item.iou),
        centerOffsetPt: round(item.centerOffsetPt)
      }))
  };
}

async function computeTextCoverage(input, context) {
  const config = context.config?.textOcr || {};
  if (config.enabled !== true) return null;
  const adapterPath = config.adapter || context.config?.adapters?.ocr;
  if (!adapterPath || /placeholder/i.test(adapterPath)) {
    return {
      provider: "text-coverage-ocr",
      skipped: true,
      reason: "No real OCR adapter configured for textOcr.adapter."
    };
  }
  let adapter;
  try {
    adapter = require(resolveMaybeRelative(context, adapterPath));
  } catch (error) {
    return textCoverageFailure(input, context, `Unable to load OCR adapter: ${error.message}`);
  }

  if (config.mode !== "fullPage") {
    return computeAnchoredTextCoverage(input, context, adapter, adapterPath, config);
  }

  const rendered = new Map((input.render?.renderedPages || []).map((page) => [page.pageIndex, page]));
  const pages = [];
  const selectedPages = selectedOcrPages(input.ir?.pages || [], config);
  for (const page of selectedPages) {
    const renderedPage = rendered.get(page.pageIndex);
    if (!renderedPage?.image) {
      pages.push({ pageIndex: page.pageIndex, ok: false, error: "Rendered page is missing." });
      continue;
    }
    try {
      const sourceSize = readImageSize(page.sourceImage);
      const renderedSize = readImageSize(renderedPage.image);
      const sourceInput = {
        pageIndex: page.pageIndex,
        sourceImage: page.sourceImage,
        page: { sourceImage: page.sourceImage, ...sourceSize },
        slideSize: input.ir.slideSize
      };
      const renderedInput = {
        pageIndex: page.pageIndex,
        sourceImage: renderedPage.image,
        page: { sourceImage: renderedPage.image, ...renderedSize },
        slideSize: input.ir.slideSize
      };
      const [sourceOcr, renderedOcr] = await runOcrMicroBatch(adapter, [sourceInput, renderedInput], context, config);
      if (sourceOcr?.ok !== true || renderedOcr?.ok !== true) {
        pages.push({
          pageIndex: page.pageIndex,
          ok: false,
          error: sourceOcr?.error || renderedOcr?.error || "OCR adapter returned non-ok result."
        });
        continue;
      }
      pages.push(compareOcrText(page.pageIndex, sourceOcr.data, renderedOcr.data, expectedPageText(page)));
    } catch (error) {
      pages.push({ pageIndex: page.pageIndex, ok: false, error: error.message });
    }
  }

  const okPages = pages.filter((page) => page.ok && typeof page.textCoverage === "number");
  const summary = {
    textCoverage: okPages.length
      ? okPages.reduce((sum, page) => sum + page.textCoverage, 0) / okPages.length
      : null,
    comparedPages: okPages.length,
    failedPages: pages.length - okPages.length,
    skippedPages: (input.ir?.pages || []).length - selectedPages.length
  };
  const report = {
    provider: "text-coverage-ocr",
    adapter: adapterPath,
    iteration: input.iteration,
    selectedPages: selectedPages.map((page) => page.pageIndex),
    summary,
    pages
  };
  const reportFile = path.join(context.outputDir, "compare", `text-coverage.iteration-${input.iteration || 0}.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  cleanupOcrAdapter(adapter);
  return { ...report, reportFile };
}

function layoutExpectedBox(item = {}) {
  if (isBox(item.source?.layoutEvidenceBox)) return item.source.layoutEvidenceBox;
  // A merged OCR label has no single raw source box. Its final IR box is the
  // explicit semantic placement, while evidenceBox remains raw provenance.
  if (item.source?.normalizedOcrTextBox === true
    && Array.isArray(item.source?.mergedElementIds)
    && item.source.mergedElementIds.length > 1
    && isBox(item.box)) {
    return item.box;
  }
  return item.source?.evidenceBox;
}

function roundedBox(box = {}) {
  return {
    x: round(Number(box.x || 0)),
    y: round(Number(box.y || 0)),
    w: round(Number(box.w || 0)),
    h: round(Number(box.h || 0))
  };
}

function resolveMeasuredLayoutBox(item, renderedPage, slideSize, imageCache) {
  if (String(item.type || "").toLowerCase() !== "text") return null;
  const target = parseHexColor(item.font?.color);
  const imageFile = renderedPage?.image;
  if (!target || !imageFile || !fs.existsSync(imageFile)) return null;
  let image = imageCache.get(imageFile);
  if (!image) {
    try { image = readPng(imageFile); } catch { return null; }
    imageCache.set(imageFile, image);
  }
  const measurementBox = rotatedBoundingBox(item.box, item.rotation);
  const crop = slideBoxToImageBox(measurementBox, slideSize, image, 0);
  const bounds = findColorBounds(image, crop, target, 92);
  if (!bounds) return null;
  return {
    x: bounds.x * (slideSize?.widthPt || 960) / image.width,
    y: bounds.y * (slideSize?.heightPt || 540) / image.height,
    w: bounds.w * (slideSize?.widthPt || 960) / image.width,
    h: bounds.h * (slideSize?.heightPt || 540) / image.height
  };
}

function rotatedBoundingBox(box, rotationDegrees = 0) {
  if (!isBox(box)) return box;
  const rotation = Number(rotationDegrees);
  if (!Number.isFinite(rotation) || Math.abs(rotation % 360) < 0.001) return box;
  const radians = rotation * Math.PI / 180;
  const width = Math.abs(box.w * Math.cos(radians)) + Math.abs(box.h * Math.sin(radians));
  const height = Math.abs(box.w * Math.sin(radians)) + Math.abs(box.h * Math.cos(radians));
  const centerX = box.x + (box.w / 2);
  const centerY = box.y + (box.h / 2);
  return { x: centerX - (width / 2), y: centerY - (height / 2), w: width, h: height };
}

function findColorBounds(image, crop, target, tolerance) {
  const startX = Math.max(0, Math.floor(Number(crop?.x || 0)));
  const startY = Math.max(0, Math.floor(Number(crop?.y || 0)));
  const endX = Math.min(Number(image?.width || 0), Math.ceil(Number(crop?.x || 0) + Number(crop?.w || 0)));
  const endY = Math.min(Number(image?.height || 0), Math.ceil(Number(crop?.y || 0) + Number(crop?.h || 0)));
  if (endX <= startX || endY <= startY) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.rgba[offset + 3] < 24 || colorDistance(image.rgba, offset, target) > tolerance) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX >= minX ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
}

function parseHexColor(value) {
  const hex = String(value || "").replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function colorDistance(rgba, offset, target) {
  return Math.hypot(rgba[offset] - target[0], rgba[offset + 1] - target[1], rgba[offset + 2] - target[2]);
}

async function computeAnchoredTextCoverage(input, context, adapter, adapterPath, config) {
  const rendered = new Map((input.render?.renderedPages || []).map((page) => [page.pageIndex, page]));
  const cropDir = path.join(context.outputDir, "compare", "text-ocr-crops", `iteration-${input.iteration || 0}`);
  fs.mkdirSync(cropDir, { recursive: true });
  const pages = [];
  const selectedPages = selectedOcrPages(input.ir?.pages || [], config);
  for (const page of selectedPages) {
    const renderedPage = rendered.get(page.pageIndex);
    if (!renderedPage?.image) {
      pages.push({ pageIndex: page.pageIndex, ok: false, error: "Rendered page is missing." });
      continue;
    }
    const sourceSize = page.sourceImage && fs.existsSync(page.sourceImage)
      ? readImageSize(page.sourceImage)
      : null;
    const renderedSize = readImageSize(renderedPage.image);
    const sourcePng = sourceSize ? readPng(page.sourceImage) : null;
    const renderedPng = readPng(renderedPage.image);
    const boxResults = [];
    const preparedBoxes = [];
    for (const textBox of page.textBoxes || []) {
      const expected = normalizeText(textBox.text);
      if (!expected) continue;
      try {
        const renderedCropFile = path.join(cropDir, `p${page.pageIndex + 1}.${sanitizeFilePart(textBox.id)}.render.png`);
        const sourceCropFile = path.join(cropDir, `p${page.pageIndex + 1}.${sanitizeFilePart(textBox.id)}.source.png`);
        const renderedMeasurementBox = rotatedBoundingBox(textBox.box, textBox.rotation);
        const renderedCropBox = slideBoxToImageBox(renderedMeasurementBox, input.ir.slideSize, renderedSize, Number(config.paddingPt ?? 2));
        const evidenceBox = textBox.source?.evidenceBox || textBox.box;
        const sourceCropBox = sourceSize
          ? slideBoxToImageBox(evidenceBox, input.ir.slideSize, sourceSize, Number(config.paddingPt ?? 2))
          : null;
        writePng(renderedCropFile, prepareOcrCrop(cropPng(renderedPng, renderedCropBox), config));
        if (sourcePng && sourceCropBox) {
          writePng(sourceCropFile, prepareOcrCrop(cropPng(sourcePng, sourceCropBox), config));
        }
        const cropSize = readImageSize(renderedCropFile);
        const renderedInput = {
          pageIndex: page.pageIndex,
          sourceImage: renderedCropFile,
          page: { sourceImage: renderedCropFile, ...cropSize },
          slideSize: { widthPt: renderedMeasurementBox.w, heightPt: renderedMeasurementBox.h },
          tesseractOptions: { psm: config.psm || 6 }
        };
        const sourceInput = config.sourceOcr !== false && sourcePng && sourceCropBox
          ? {
            pageIndex: page.pageIndex,
            sourceImage: sourceCropFile,
            page: { sourceImage: sourceCropFile, ...readImageSize(sourceCropFile) },
            slideSize: { widthPt: evidenceBox.w, heightPt: evidenceBox.h },
            tesseractOptions: { psm: config.psm || 6 }
          }
          : null;
        preparedBoxes.push({ textBox, expected, renderedInput, sourceInput, renderedCropFile, sourceCropFile, renderedMeasurementBox, evidenceBox, sourceCropBox, renderedCropBox });
      } catch (error) {
        boxResults.push({
          elementId: textBox.id,
          ok: false,
          expectedText: textBox.text,
          expectedNormalized: expected,
          textCoverage: 0,
          expectedCharCount: expected.length,
          renderedCharCount: 0,
          matchedCharCount: 0,
          error: error.message
        });
      }
    }
    const requestEntries = preparedBoxes.flatMap((item) => [
      { owner: item, kind: "rendered", input: item.renderedInput },
      ...(item.sourceInput ? [{ owner: item, kind: "source", input: item.sourceInput }] : [])
    ]);
    await runOcrRequestEntries(adapter, requestEntries, context, config);
    for (const item of preparedBoxes) {
      const renderedOcr = item.renderedResult;
      const sourceOcr = item.sourceResult || null;
      if (item.renderedError || renderedOcr?.ok !== true) {
        boxResults.push(failedAnchoredBox(item.textBox, item.expected, item.renderedError?.message || renderedOcr?.error));
        continue;
      }
      const renderedText = normalizeText(ocrText(renderedOcr.data));
      const sourceText = sourceOcr?.ok === true ? normalizeText(ocrText(sourceOcr.data)) : "";
      const comparison = compareAnchoredOcrTexts(item.expected, sourceText, renderedText);
      boxResults.push({
        elementId: item.textBox.id,
        ok: true,
        expectedText: item.textBox.text,
        expectedNormalized: item.expected,
        sourceOcrText: sourceOcr?.ok === true ? ocrText(sourceOcr.data) : null,
        sourceOcrCached: sourceOcr?.cached === true ? true : null,
        sourceNormalized: sourceText || null,
        renderedOcrText: ocrText(renderedOcr.data),
        renderedOcrCached: renderedOcr.cached === true,
        renderedNormalized: renderedText,
        textCoverage: comparison.textCoverage,
        sourceCoverage: comparison.sourceRelativeCoverage,
        sourceRelativeCoverage: comparison.sourceRelativeCoverage,
        expectedCoverage: comparison.expectedCoverage,
        uncertaintyAdjustedCoverage: comparison.uncertaintyAdjustedCoverage,
        ocrUncertainCharCount: comparison.ocrUncertainCharCount,
        expectedCharCount: comparison.expectedCharCount,
        renderedCharCount: renderedText.length,
        matchedCharCount: comparison.matchedCharCount,
        sourceCharCount: sourceText.length || null,
        sourceMatchedCharCount: comparison.sourceMatchedCharCount,
        missingSample: sampleMissing(item.expected, renderedText),
        renderedCropImage: item.renderedCropFile,
        sourceCropImage: item.sourceInput ? item.sourceCropFile : null,
        sourceBox: item.textBox.box,
        evidenceBox: item.evidenceBox,
        renderedBox: item.renderedMeasurementBox,
        sourceCropBox: item.sourceCropBox,
        renderedCropBox: item.renderedCropBox,
        sourceImageSize: sourceSize,
        renderedImageSize: renderedSize
      });
    }
    const okBoxes = boxResults.filter((item) => item.ok && typeof item.textCoverage === "number");
    const boxCoverage = summarizeAnchoredBoxResults(boxResults);
    const totalExpected = boxCoverage.expectedCharCount;
    const totalMatched = boxCoverage.matchedCharCount;
    const cachedBoxes = okBoxes.filter((item) => item.renderedOcrCached === true || item.sourceOcrCached === true).length;
    pages.push({
      pageIndex: page.pageIndex,
      ok: boxCoverage.measurableBoxCount > 0,
      textCoverage: boxCoverage.textCoverage,
      expectedCharCount: totalExpected,
      renderedCharCount: okBoxes.reduce((sum, item) => sum + item.renderedCharCount, 0),
      matchedCharCount: totalMatched,
      cachedBoxes,
      cacheHits: okBoxes.reduce((sum, item) => sum
        + (item.renderedOcrCached === true ? 1 : 0)
        + (item.sourceOcrCached === true ? 1 : 0), 0),
      cacheMisses: okBoxes.reduce((sum, item) => sum
        + (item.renderedOcrCached === true ? 0 : 1)
        + (item.sourceOcrText !== null && item.sourceOcrCached !== true ? 1 : 0), 0),
      failedBoxes: boxResults.length - okBoxes.length,
      boxes: boxResults
    });
  }

  const okPages = pages.filter((page) => page.ok && typeof page.textCoverage === "number");
  const totalExpected = okPages.reduce((sum, page) => sum + page.expectedCharCount, 0);
  const totalMatched = okPages.reduce((sum, page) => sum + page.matchedCharCount, 0);
  const summary = {
    textCoverage: totalExpected ? totalMatched / totalExpected : null,
    comparedPages: okPages.length,
    failedPages: pages.length - okPages.length,
    skippedPages: (input.ir?.pages || []).length - selectedPages.length,
    expectedCharCount: totalExpected,
    matchedCharCount: totalMatched,
    cacheHits: okPages.reduce((sum, page) => sum + (page.cacheHits || 0), 0),
    cacheMisses: okPages.reduce((sum, page) => sum + (page.cacheMisses || 0), 0)
  };
  const report = {
    provider: "text-coverage-ocr",
    mode: "anchored-source-vs-rendered-textboxes",
    adapter: adapterPath,
    iteration: input.iteration,
    cropDir,
    selectedPages: selectedPages.map((page) => page.pageIndex),
    summary,
    pages
  };
  const reportFile = path.join(context.outputDir, "compare", `text-coverage.iteration-${input.iteration || 0}.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  cleanupOcrAdapter(adapter);
  return { ...report, reportFile };
}

async function runOcrMicroBatch(adapter, inputs, context, config = {}) {
  if (config.microBatch !== false && typeof adapter.runBatch === "function" && inputs.length > 1) {
    return adapter.runBatch(inputs, context);
  }
  const results = [];
  for (const input of inputs) results.push(await adapter(input, context));
  return results;
}

async function runOcrRequestEntries(adapter, entries, context, config = {}) {
  const batchSize = Math.max(1, Math.min(16, Number.isInteger(Number(config.microBatchSize)) ? Number(config.microBatchSize) : 8));
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const chunk = entries.slice(offset, offset + batchSize);
    if (config.microBatch !== false && typeof adapter.runBatch === "function") {
      try {
        const results = await adapter.runBatch(chunk.map((entry) => entry.input), context);
        if (!Array.isArray(results) || results.length !== chunk.length) throw new Error("OCR batch returned an invalid result count");
        chunk.forEach((entry, index) => { entry.owner[`${entry.kind}Result`] = results[index]; });
        continue;
      } catch {
        // Isolate one bad crop without losing the rest of the page's OCR evidence.
      }
    }
    for (const entry of chunk) {
      try { entry.owner[`${entry.kind}Result`] = await adapter(entry.input, context); }
      catch (error) { entry.owner[`${entry.kind}Error`] = error; }
    }
  }
}

function failedAnchoredBox(textBox, expected, error) {
  return {
    elementId: textBox.id,
    ok: false,
    expectedText: textBox.text,
    expectedNormalized: expected,
    textCoverage: 0,
    expectedCharCount: expected.length,
    renderedCharCount: 0,
    matchedCharCount: 0,
    error: error || "OCR adapter returned non-ok result."
  };
}

function summarizeAnchoredBoxResults(boxResults) {
  const measurableBoxes = boxResults.filter((item) => Number.isFinite(item.expectedCharCount)
    && item.expectedCharCount > 0 && Number.isFinite(item.matchedCharCount));
  const expectedCharCount = measurableBoxes.reduce((sum, item) => sum + item.expectedCharCount, 0);
  const matchedCharCount = measurableBoxes.reduce((sum, item) => sum + item.matchedCharCount, 0);
  return {
    measurableBoxCount: measurableBoxes.length,
    expectedCharCount,
    matchedCharCount,
    textCoverage: expectedCharCount ? matchedCharCount / expectedCharCount : null
  };
}

function compareAnchoredOcrTexts(expected, sourceText, renderedText) {
  const baselineText = sourceText || expected;
  const expectedSequenceMatched = longestCommonSubsequenceLength(expected, renderedText);
  const expectedBagMatched = characterBagMatchLength(expected, renderedText);
  const expectedMatched = Math.max(expectedSequenceMatched, expectedBagMatched);
  const sourceSequenceMatched = sourceText ? longestCommonSubsequenceLength(sourceText, renderedText) : null;
  const sourceBagMatched = sourceText ? characterBagMatchLength(sourceText, renderedText) : null;
  const sourceMatched = sourceText ? Math.max(sourceSequenceMatched, sourceBagMatched) : null;
  const expectedCoverage = expected.length ? expectedMatched / expected.length : null;
  const sourceRelativeCoverage = sourceText.length ? sourceMatched / sourceText.length : null;
  let matchedCharCount = expectedMatched;
  let ocrUncertainCharCount = 0;

  if (expected && sourceText && expected !== sourceText
    && expected.length === sourceText.length && expected.length === renderedText.length) {
    matchedCharCount = 0;
    for (let index = 0; index < expected.length; index += 1) {
      if (renderedText[index] === expected[index]) {
        matchedCharCount += 1;
      } else if (sourceText[index] !== expected[index] && renderedText[index] !== expected[index]) {
        matchedCharCount += 1;
        ocrUncertainCharCount += 1;
      }
    }
  }

  const expectedCharCount = expected.length || baselineText.length;
  const uncertaintyAdjustedCoverage = expectedCharCount ? matchedCharCount / expectedCharCount : null;
  return {
    textCoverage: uncertaintyAdjustedCoverage,
    expectedCoverage,
    sourceRelativeCoverage,
    uncertaintyAdjustedCoverage,
    ocrUncertainCharCount,
    expectedCharCount,
    matchedCharCount,
    sourceMatchedCharCount: sourceMatched,
    expectedSequenceMatchedCharCount: expectedSequenceMatched,
    expectedBagMatchedCharCount: expectedBagMatched,
    sourceSequenceMatchedCharCount: sourceSequenceMatched,
    sourceBagMatchedCharCount: sourceBagMatched
  };
}

function cleanupOcrAdapter(adapter) {
  if (typeof adapter?.closeActiveEngine === "function") {
    adapter.closeActiveEngine();
  }
}

function selectedOcrPages(pages, config = {}) {
  if (!Array.isArray(config.pageIndexes) || config.pageIndexes.length === 0) return pages;
  const selected = new Set(config.pageIndexes.map((index) => Number(index)).filter(Number.isFinite));
  return pages.filter((page, index) => selected.has(page.pageIndex ?? index));
}

function textCoverageFailure(input, context, reason) {
  const report = {
    provider: "text-coverage-ocr",
    iteration: input.iteration,
    skipped: true,
    reason,
    summary: { textCoverage: null, comparedPages: 0, failedPages: 0 },
    pages: []
  };
  const reportFile = path.join(context.outputDir, "compare", `text-coverage.iteration-${input.iteration || 0}.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportFile };
}

function resolveMaybeRelative(context, value) {
  if (path.isAbsolute(value)) return value;
  const fromConfig = context.configFile ? path.resolve(path.dirname(context.configFile), value) : null;
  if (fromConfig && fs.existsSync(fromConfig)) return fromConfig;
  return path.resolve(context.skillRoot, value);
}

function compareOcrText(pageIndex, sourceOcr, renderedOcr, expectedText = "") {
  const sourceText = normalizeText(ocrText(sourceOcr));
  const renderedText = normalizeText(ocrText(renderedOcr));
  const reliability = assessOcrReliability({
    expectedText: normalizeText(expectedText),
    sourceText,
    renderedText
  });
  if (reliability.ok === false) {
    return {
      pageIndex,
      ok: false,
      error: reliability.reason,
      sourceCharCount: sourceText.length,
      renderedCharCount: renderedText.length,
      expectedCjkCharCount: reliability.expectedCjkCharCount,
      sourceCjkRatio: reliability.sourceCjkRatio,
      renderedCjkRatio: reliability.renderedCjkRatio,
      sourceSample: truncateTextSample(sourceText),
      renderedSample: truncateTextSample(renderedText)
    };
  }
  const lcs = longestCommonSubsequenceLength(sourceText, renderedText);
  const sequenceCoverage = sourceText.length ? lcs / sourceText.length : null;
  const bagMatched = characterBagMatchLength(sourceText, renderedText);
  const bagCoverage = sourceText.length ? bagMatched / sourceText.length : null;
  const textCoverage = Math.max(sequenceCoverage ?? 0, bagCoverage ?? 0);
  return {
    pageIndex,
    ok: true,
    textCoverage,
    sequenceCoverage,
    bagCoverage,
    sourceCharCount: sourceText.length,
    renderedCharCount: renderedText.length,
    matchedCharCount: Math.max(lcs, bagMatched),
    sequenceMatchedCharCount: lcs,
    bagMatchedCharCount: bagMatched,
    sourceSample: truncateTextSample(sourceText),
    renderedSample: truncateTextSample(renderedText),
    expectedCjkCharCount: reliability.expectedCjkCharCount,
    sourceCjkRatio: reliability.sourceCjkRatio,
    renderedCjkRatio: reliability.renderedCjkRatio,
    missingSample: sampleMissing(sourceText, renderedText)
  };
}

function expectedPageText(page = {}) {
  return (page.textBoxes || [])
    .map((item) => String(item?.text || ""))
    .filter(Boolean)
    .join("\n");
}

function assessOcrReliability({ expectedText = "", sourceText = "", renderedText = "" } = {}) {
  const expectedCjkCharCount = countCjkChars(expectedText);
  const sourceCjkRatio = cjkRatio(sourceText);
  const renderedCjkRatio = cjkRatio(renderedText);
  if (
    expectedCjkCharCount >= 8
    && sourceText.length >= 20
    && renderedText.length >= 20
    && sourceCjkRatio < 0.12
    && renderedCjkRatio < 0.12
  ) {
    return {
      ok: false,
      reason: "OCR output is unreliable for CJK text: expected page text contains Chinese, but source/rendered OCR returned almost no CJK characters.",
      expectedCjkCharCount,
      sourceCjkRatio,
      renderedCjkRatio
    };
  }
  return {
    ok: true,
    expectedCjkCharCount,
    sourceCjkRatio,
    renderedCjkRatio
  };
}

function countCjkChars(text) {
  return [...String(text || "")].filter((char) => /\p{Script=Han}/u.test(char)).length;
}

function cjkRatio(text) {
  const chars = [...String(text || "")];
  if (chars.length === 0) return 0;
  return countCjkChars(text) / chars.length;
}

function truncateTextSample(text, limit = 500) {
  const value = String(text || "");
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

function ocrText(data = {}) {
  const lines = Array.isArray(data.lines) ? data.lines : [];
  if (lines.length > 0) return lines.map((line) => line.text || "").join("\n");
  const words = Array.isArray(data.words) ? data.words : [];
  return words.map((word) => word.text || "").join("");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{Letter}\p{Number}]/gu, "");
}

function longestCommonSubsequenceLength(a, b) {
  if (!a || !b) return 0;
  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], curr[j - 1]);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function characterBagMatchLength(source, rendered) {
  if (!source || !rendered) return 0;
  const counts = new Map();
  for (const char of rendered) counts.set(char, (counts.get(char) || 0) + 1);
  let matched = 0;
  for (const char of source) {
    const count = counts.get(char) || 0;
    if (count <= 0) continue;
    counts.set(char, count - 1);
    matched += 1;
  }
  return matched;
}

function sampleMissing(source, rendered) {
  const missing = [];
  let cursor = 0;
  for (const char of source) {
    const foundAt = rendered.indexOf(char, cursor);
    if (foundAt >= 0) {
      cursor = foundAt + 1;
    } else {
      missing.push(char);
      if (missing.length >= 40) break;
    }
  }
  return missing.join("");
}

function slideBoxToImageBox(box, slideSize = {}, imageSize = {}, paddingPt = 0) {
  const widthPt = slideSize.widthPt || 960;
  const heightPt = slideSize.heightPt || 540;
  const widthPx = imageSize.widthPx || imageSize.width || 1920;
  const heightPx = imageSize.heightPx || imageSize.height || 1080;
  return {
    x: (box.x - paddingPt) * widthPx / widthPt,
    y: (box.y - paddingPt) * heightPx / heightPt,
    w: (box.w + paddingPt * 2) * widthPx / widthPt,
    h: (box.h + paddingPt * 2) * heightPx / heightPt
  };
}

function upscalePng(image, scale) {
  const factor = Math.max(1, Math.min(6, Math.round(scale || 1)));
  if (factor === 1) return image;
  const width = image.width * factor;
  const height = image.height * factor;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const srcY = Math.floor(y / factor);
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.floor(x / factor);
      const srcOffset = (srcY * image.width + srcX) * 4;
      const dstOffset = (y * width + x) * 4;
      image.rgba.copy(rgba, dstOffset, srcOffset, srcOffset + 4);
    }
  }
  return { width, height, rgba };
}

function prepareOcrCrop(image, config = {}) {
  const normalized = config.preprocess === false ? image : normalizeForOcr(image);
  return upscalePng(normalized, Number(config.upscale ?? 3));
}

function normalizeForOcr(image) {
  let total = 0;
  const pixels = image.width * image.height;
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    total += luminance(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]);
  }
  const avg = total / pixels;
  const darkBackground = avg < 150;
  const rgba = Buffer.alloc(image.rgba.length);
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    const r = image.rgba[offset];
    const g = image.rgba[offset + 1];
    const b = image.rgba[offset + 2];
    const y = luminance(r, g, b);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const contrast = max - min;
    const ink = darkBackground
      ? y > avg + 18
      : y < avg - 26 || (contrast > 42 && y < 210);
    rgba[offset] = ink ? 0 : 255;
    rgba[offset + 1] = ink ? 0 : 255;
    rgba[offset + 2] = ink ? 0 : 255;
    rgba[offset + 3] = 255;
  }
  return { ...image, rgba };
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sanitizeFilePart(value) {
  return String(value || "text").replace(/[^a-z0-9_.-]+/gi, "_").slice(0, 80);
}

function summarizeGeometry(ir) {
  const result = {
    outOfBoundsObjects: [],
    distortedImages: [],
    maxOutOfBoundsPt: 0,
    maxImageAspectRatioDelta: 0
  };
  if (!ir || !Array.isArray(ir.pages)) return result;
  const slideWidth = ir.slideSize?.widthPt || 0;
  const slideHeight = ir.slideSize?.heightPt || 0;
  for (const page of ir.pages) {
    for (const item of collectItems(page)) {
      const bounds = boxBounds(item.box);
      if (!bounds) continue;
      const overflow = Math.max(
        0 - bounds.left,
        0 - bounds.top,
        bounds.right - slideWidth,
        bounds.bottom - slideHeight,
        0
      );
      if (overflow > 0) {
        const issue = {
          pageIndex: page.pageIndex,
          elementId: item.id,
          type: item.type,
          overflowPt: round(overflow),
          box: item.box
        };
        result.outOfBoundsObjects.push(issue);
        result.maxOutOfBoundsPt = Math.max(result.maxOutOfBoundsPt, overflow);
      }
    }
    for (const image of page.images || []) {
      const delta = imageAspectDelta(image);
      if (delta == null) continue;
      if (delta > 0) {
        result.maxImageAspectRatioDelta = Math.max(result.maxImageAspectRatioDelta, delta);
      }
      if (delta > 0.03) {
        result.distortedImages.push({
          pageIndex: page.pageIndex,
          elementId: image.id,
          type: image.type,
          aspectRatioDelta: round(delta),
          box: image.box,
          assetPath: image.assetPath || image.style?.assetPath || image.source?.cropImage
        });
      }
    }
  }
  result.maxOutOfBoundsPt = round(result.maxOutOfBoundsPt);
  result.maxImageAspectRatioDelta = round(result.maxImageAspectRatioDelta);
  return result;
}

function collectItems(page) {
  return [
    ...(page.textBoxes || []).map((item) => ({ ...item, type: "text" })),
    ...(page.shapes || []),
    ...(page.images || []),
    ...(page.tables || []),
    ...(page.charts || []),
    ...(page.icons || [])
  ];
}

function boxBounds(box) {
  if (!box || ["x", "y", "w", "h"].some((key) => typeof box[key] !== "number")) return null;
  return {
    left: Math.min(box.x, box.x + box.w),
    right: Math.max(box.x, box.x + box.w),
    top: Math.min(box.y, box.y + box.h),
    bottom: Math.max(box.y, box.y + box.h)
  };
}

function isBox(box) {
  return Boolean(box && ["x", "y", "w", "h"].every((key) => typeof box[key] === "number"));
}

function boxIou(a, b) {
  const ab = boxBounds(a);
  const bb = boxBounds(b);
  if (!ab || !bb) return 0;
  const left = Math.max(ab.left, bb.left);
  const right = Math.min(ab.right, bb.right);
  const top = Math.max(ab.top, bb.top);
  const bottom = Math.min(ab.bottom, bb.bottom);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const areaA = Math.max(0, ab.right - ab.left) * Math.max(0, ab.bottom - ab.top);
  const areaB = Math.max(0, bb.right - bb.left) * Math.max(0, bb.bottom - bb.top);
  const union = areaA + areaB - intersection;
  return union > 0 ? intersection / union : 0;
}

function centerOffset(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  return Math.sqrt((ac.x - bc.x) ** 2 + (ac.y - bc.y) ** 2);
}

function imageAspectDelta(image) {
  if (!image?.box || !image.box.w || !image.box.h) return null;
  const asset = image.assetPath || image.style?.assetPath || image.source?.cropImage;
  if (!asset) return null;
  try {
    const size = readImageSize(path.resolve(asset));
    if (!size.widthPx || !size.heightPx) return null;
    const boxRatio = Math.abs(image.box.w / image.box.h);
    const assetRatio = size.widthPx / size.heightPx;
    return Math.abs(boxRatio - assetRatio) / assetRatio;
  } catch {
    return null;
  }
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function summarizeEditability(ir) {
  const result = {
    pages: 0,
    textBoxes: 0,
    shapes: 0,
    images: 0,
    tables: 0,
    charts: 0,
    icons: 0,
    editableObjects: 0,
    nonEditableObjects: 0,
    rasterImageAreaRatio: 0,
    actionableRasterImageAreaRatio: 0,
    sourceNativePassthroughPages: 0,
    sourceNativePassthroughObjects: 0,
    nonEditableItems: [],
    nonEditableByReason: {}
  };
  if (!ir || !Array.isArray(ir.pages)) return result;
  result.pages = ir.pages.length;
  let rasterArea = 0;
  let actionableRasterArea = 0;
  let slideArea = 0;
  const width = ir.slideSize?.widthPt || 0;
  const height = ir.slideSize?.heightPt || 0;
  for (const page of ir.pages) {
    const sourceNativePassthrough = page?.preserveTemplateSlide === true
      && page?.source?.detector === "source-native-slide-passthrough";
    if (sourceNativePassthrough) {
      const sourceNativeObjects = Math.max(0, Number(page?.source?.nativeObjects || 0));
      result.sourceNativePassthroughPages += 1;
      result.sourceNativePassthroughObjects += sourceNativeObjects;
      result.editableObjects += sourceNativeObjects;
    }
    const groups = {
      textBoxes: page.textBoxes || [],
      shapes: page.shapes || [],
      images: page.images || [],
      tables: page.tables || [],
      charts: page.charts || [],
      icons: page.icons || []
    };
    slideArea += width * height;
    for (const [key, items] of Object.entries(groups)) {
      result[key] += items.length;
      for (const item of items) {
        const editable = key !== "images" || item.source?.editable === true;
        if (editable) result.editableObjects += 1;
        else {
          result.nonEditableObjects += 1;
          const reason = nonEditableReason(item);
          result.nonEditableByReason[reason] = (result.nonEditableByReason[reason] || 0) + 1;
          if (result.nonEditableItems.length < 30) {
            result.nonEditableItems.push({
              pageIndex: page.pageIndex,
              elementId: item.id,
              type: key.replace(/s$/, ""),
              reason,
              box: item.box || null
            });
          }
        }
        if (key === "images" && item.box) {
          const itemArea = Math.max(0, item.box.w || 0) * Math.max(0, item.box.h || 0);
          rasterArea += itemArea;
          if (!isAllowedDecorativeBackgroundImage(item)) actionableRasterArea += itemArea;
        }
      }
    }
  }
  result.rasterImageAreaRatio = slideArea > 0 ? rasterArea / slideArea : 0;
  result.actionableRasterImageAreaRatio = slideArea > 0 ? actionableRasterArea / slideArea : 0;
  return result;
}

function isAllowedDecorativeBackgroundImage(item) {
  if (item?.type === "fidelity-background") {
    return /^(?:decorative-cover-background-underlay|decorative-page-chrome-underlay)$/.test(
      String(item?.source?.detector || "")
    );
  }
  return item?.type === "source-background"
    && item?.style?.strategy === "full-slide-underlay"
    && item?.source?.nonEditableReason === "Full-slide underlay preserves visual fidelity while OCR text is rebuilt as hidden editable overlay text.";
}

function nonEditableReason(item = {}) {
  return item.source?.nonEditableReason
    || item.source?.reason
    || item.source?.regionReason
    || item.reason
    || item.source?.strategy
    || "Raster image retained for visual fidelity";
}

module.exports._private = {
  characterBagMatchLength,
  assessOcrReliability,
  compareAnchoredOcrTexts,
  compareOcrText,
  countCjkChars,
  cjkRatio,
  findColorBounds,
  layoutExpectedBox,
  longestCommonSubsequenceLength,
  normalizeText,
  rotatedBoundingBox,
  roundedBox,
  runOcrRequestEntries,
  summarizeAnchoredBoxResults,
  summarizeEditability,
  summarizeLayoutEvidence,
  truncateTextSample
};
