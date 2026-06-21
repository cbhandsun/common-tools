"use strict";

const fs = require("fs");
const path = require("path");
const { readImageSize } = require("../lib/image-size");
const { readPng, writePng, cropPng } = require("../lib/png");

module.exports = async function compareThresholds(input, context = {}) {
  const textCoverage = await computeTextCoverage(input, context);
  const layout = summarizeLayoutEvidence(input.ir);
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
      actual: editability.rasterImageAreaRatio,
      threshold: thresholds.maxRasterImageAreaRatio,
      required: typeof thresholds.maxRasterImageAreaRatio === "number",
      passed: typeof thresholds.maxRasterImageAreaRatio !== "number"
        || editability.rasterImageAreaRatio <= thresholds.maxRasterImageAreaRatio
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
      findings: checks
        .filter((check) => !check.passed || typeof check.actual !== "number")
        .map((check) => ({
          severity: check.required ? "error" : "warning",
          metric: check.name,
          message: typeof check.actual === "number"
            ? `${check.name} is outside threshold.`
            : `${check.name} is not produced by the current diff adapter.`
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

function summarizeLayoutEvidence(ir) {
  const items = [];
  for (const page of ir?.pages || []) {
    for (const item of collectItems(page)) {
      if ((item.type || "").toLowerCase() === "line") continue;
      const expected = item.source?.evidenceBox;
      if (!isBox(item.box) || !isBox(expected)) continue;
      const iou = boxIou(item.box, expected);
      const offset = centerOffset(item.box, expected);
      items.push({
        pageIndex: page.pageIndex,
        elementId: item.id,
        type: item.type,
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
  for (const page of input.ir?.pages || []) {
    const renderedPage = rendered.get(page.pageIndex);
    if (!renderedPage?.image) {
      pages.push({ pageIndex: page.pageIndex, ok: false, error: "Rendered page is missing." });
      continue;
    }
    try {
      const sourceSize = readImageSize(page.sourceImage);
      const renderedSize = readImageSize(renderedPage.image);
      const sourceOcr = await adapter({
        pageIndex: page.pageIndex,
        sourceImage: page.sourceImage,
        page: { sourceImage: page.sourceImage, ...sourceSize },
        slideSize: input.ir.slideSize
      }, context);
      const renderedOcr = await adapter({
        pageIndex: page.pageIndex,
        sourceImage: renderedPage.image,
        page: { sourceImage: renderedPage.image, ...renderedSize },
        slideSize: input.ir.slideSize
      }, context);
      if (sourceOcr?.ok !== true || renderedOcr?.ok !== true) {
        pages.push({
          pageIndex: page.pageIndex,
          ok: false,
          error: sourceOcr?.error || renderedOcr?.error || "OCR adapter returned non-ok result."
        });
        continue;
      }
      pages.push(compareOcrText(page.pageIndex, sourceOcr.data, renderedOcr.data));
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
    failedPages: pages.length - okPages.length
  };
  const report = {
    provider: "text-coverage-ocr",
    adapter: adapterPath,
    iteration: input.iteration,
    summary,
    pages
  };
  const reportFile = path.join(context.outputDir, "compare", `text-coverage.iteration-${input.iteration || 0}.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportFile };
}

async function computeAnchoredTextCoverage(input, context, adapter, adapterPath, config) {
  const rendered = new Map((input.render?.renderedPages || []).map((page) => [page.pageIndex, page]));
  const cropDir = path.join(context.outputDir, "compare", "text-ocr-crops", `iteration-${input.iteration || 0}`);
  fs.mkdirSync(cropDir, { recursive: true });
  const pages = [];
  for (const page of input.ir?.pages || []) {
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
    for (const textBox of page.textBoxes || []) {
      const expected = normalizeText(textBox.text);
      if (!expected) continue;
      try {
        const renderedCropFile = path.join(cropDir, `p${page.pageIndex + 1}.${sanitizeFilePart(textBox.id)}.render.png`);
        const sourceCropFile = path.join(cropDir, `p${page.pageIndex + 1}.${sanitizeFilePart(textBox.id)}.source.png`);
        const renderedCropBox = slideBoxToImageBox(textBox.box, input.ir.slideSize, renderedSize, Number(config.paddingPt ?? 2));
        const evidenceBox = textBox.source?.evidenceBox || textBox.box;
        const sourceCropBox = sourceSize
          ? slideBoxToImageBox(evidenceBox, input.ir.slideSize, sourceSize, Number(config.paddingPt ?? 2))
          : null;
        writePng(renderedCropFile, prepareOcrCrop(cropPng(renderedPng, renderedCropBox), config));
        if (sourcePng && sourceCropBox) {
          writePng(sourceCropFile, prepareOcrCrop(cropPng(sourcePng, sourceCropBox), config));
        }
        const cropSize = readImageSize(renderedCropFile);
        const renderedOcr = await adapter({
          pageIndex: page.pageIndex,
          sourceImage: renderedCropFile,
          page: { sourceImage: renderedCropFile, ...cropSize },
          slideSize: { widthPt: textBox.box.w, heightPt: textBox.box.h },
          tesseractOptions: { psm: config.psm || 6 }
        }, context);
        const sourceOcr = sourcePng && sourceCropBox
          ? await adapter({
            pageIndex: page.pageIndex,
            sourceImage: sourceCropFile,
            page: { sourceImage: sourceCropFile, ...readImageSize(sourceCropFile) },
            slideSize: { widthPt: evidenceBox.w, heightPt: evidenceBox.h },
            tesseractOptions: { psm: config.psm || 6 }
          }, context)
          : null;
        if (renderedOcr?.ok !== true) {
          boxResults.push({
            elementId: textBox.id,
            ok: false,
            expectedText: textBox.text,
            error: renderedOcr?.error || "OCR adapter returned non-ok result."
          });
          continue;
        }
        const renderedText = normalizeText(ocrText(renderedOcr.data));
        const sourceText = sourceOcr?.ok === true ? normalizeText(ocrText(sourceOcr.data)) : "";
        const baselineText = sourceText || expected;
        const matched = longestCommonSubsequenceLength(baselineText, renderedText);
        const expectedMatched = longestCommonSubsequenceLength(expected, renderedText);
        boxResults.push({
          elementId: textBox.id,
          ok: true,
          expectedText: textBox.text,
          expectedNormalized: expected,
          sourceOcrText: sourceOcr?.ok === true ? ocrText(sourceOcr.data) : null,
          sourceNormalized: sourceText || null,
          renderedOcrText: ocrText(renderedOcr.data),
          renderedNormalized: renderedText,
          textCoverage: baselineText.length ? matched / baselineText.length : null,
          expectedCoverage: expected.length ? expectedMatched / expected.length : null,
          expectedCharCount: baselineText.length,
          renderedCharCount: renderedText.length,
          matchedCharCount: matched,
          missingSample: sampleMissing(baselineText, renderedText),
          renderedCropImage: renderedCropFile,
          sourceCropImage: sourcePng && sourceCropBox ? sourceCropFile : null,
          sourceBox: textBox.box,
          sourceImageSize: sourceSize,
          renderedImageSize: renderedSize
        });
      } catch (error) {
        boxResults.push({
          elementId: textBox.id,
          ok: false,
          expectedText: textBox.text,
          error: error.message
        });
      }
    }
    const okBoxes = boxResults.filter((item) => item.ok && typeof item.textCoverage === "number");
    const totalExpected = okBoxes.reduce((sum, item) => sum + item.expectedCharCount, 0);
    const totalMatched = okBoxes.reduce((sum, item) => sum + item.matchedCharCount, 0);
    pages.push({
      pageIndex: page.pageIndex,
      ok: okBoxes.length > 0,
      textCoverage: totalExpected ? totalMatched / totalExpected : null,
      expectedCharCount: totalExpected,
      renderedCharCount: okBoxes.reduce((sum, item) => sum + item.renderedCharCount, 0),
      matchedCharCount: totalMatched,
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
    expectedCharCount: totalExpected,
    matchedCharCount: totalMatched
  };
  const report = {
    provider: "text-coverage-ocr",
    mode: "anchored-source-vs-rendered-textboxes",
    adapter: adapterPath,
    iteration: input.iteration,
    cropDir,
    summary,
    pages
  };
  const reportFile = path.join(context.outputDir, "compare", `text-coverage.iteration-${input.iteration || 0}.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportFile };
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

function compareOcrText(pageIndex, sourceOcr, renderedOcr) {
  const sourceText = normalizeText(ocrText(sourceOcr));
  const renderedText = normalizeText(ocrText(renderedOcr));
  const lcs = longestCommonSubsequenceLength(sourceText, renderedText);
  const textCoverage = sourceText.length ? lcs / sourceText.length : null;
  return {
    pageIndex,
    ok: true,
    textCoverage,
    sourceCharCount: sourceText.length,
    renderedCharCount: renderedText.length,
    matchedCharCount: lcs,
    missingSample: sampleMissing(sourceText, renderedText)
  };
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
    nonEditableItems: [],
    nonEditableByReason: {}
  };
  if (!ir || !Array.isArray(ir.pages)) return result;
  result.pages = ir.pages.length;
  let rasterArea = 0;
  let slideArea = 0;
  const width = ir.slideSize?.widthPt || 0;
  const height = ir.slideSize?.heightPt || 0;
  for (const page of ir.pages) {
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
          rasterArea += Math.max(0, item.box.w || 0) * Math.max(0, item.box.h || 0);
        }
      }
    }
  }
  result.rasterImageAreaRatio = slideArea > 0 ? rasterArea / slideArea : 0;
  return result;
}

function nonEditableReason(item = {}) {
  return item.source?.nonEditableReason
    || item.source?.reason
    || item.source?.regionReason
    || item.reason
    || item.source?.strategy
    || "Raster image retained for visual fidelity";
}
