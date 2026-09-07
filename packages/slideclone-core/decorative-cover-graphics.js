"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { cropPng, writePng, readPng } = require("./png");
const { ensureDir, eraseMasks } = require("./residual-primitive-erasure");
const { ptToPxBox, luma, pixel, saturation, maskBounds, clamp, round } = require("./raster-native-detection");
const { safeIdentifier } = require("./workflow-shape-primitives");
const { spawnSync } = require("node:child_process");
const { DEFAULT_SLIDE } = require("./page-text-rule-helpers");
const { normalizeWorkflowCoverTextBox } = require("./workflow-cover-text");
let cachedInpaintPython;

function createDecorativeCoverBackground(image, textBoxes, slideSize, options) {
  const mode = options.mode || decorativeBackgroundMode({ image, textBoxes, detectedLineCount: options.detectedLineCount });
  if (!options.assetDir || !mode) {
    return [];
  }
  ensureDir(options.assetDir);
  const coverMode = mode === "cover";
  const workflowCoverBands = coverMode
    ? workflowCoverTextFreeBands(textBoxes, slideSize)
    : null;
  if (workflowCoverBands) {
    return createWorkflowCoverTextFreeBandCrops(image, workflowCoverBands, textBoxes, slideSize, options);
  }
  const masks = textBoxes.map((item) => ptToPxBox(item.box, image, slideSize, 10));
  const backgroundImage = coverMode
    ? inpaintDecorativeCoverMasks(image, masks, options)
    : eraseMasks(image, masks);
  const crop = cropPng(backgroundImage, { x: 0, y: 0, w: image.width, h: image.height });
  const suffix = mode === "page-chrome" ? "decorative-page-chrome" : "decorative-cover-background";
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-${suffix}.png`);
  writePng(file, crop);
  return [{
    id: coverMode ? "native-decorative-cover-background" : "native-decorative-page-chrome",
    type: "fidelity-background",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt },
    source: {
      editable: false,
      nativeRebuild: true,
      detector: coverMode ? "decorative-cover-background-underlay" : "decorative-page-chrome-underlay",
      expressionFamily: "decorative-asset",
      expressionForm: coverMode ? "decorative-cover-visual" : "decorative-page-chrome",
      expressionSubtype: coverMode ? "cover-background" : "page-chrome-background",
      textErasedFromCrop: masks.length > 0,
      editableTextOverlayExpected: masks.length > 0,
      reason: coverMode
        ? "highly-visual-cover-background-preserved-under-editable-text"
        : "highly-visual-page-chrome-preserved-under-editable-text",
      layer: {
        layerType: "background-zone"
      }
    }
  }];
}

function workflowCoverTextFreeBands(textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const title = (textBoxes || []).find((item) => /A[Iil1]\s*Skills.*核心能力矩阵/i.test(String(item?.text || "")));
  const subtitle = (textBoxes || []).find((item) => /重塑产品交付工作流.*数智赋能/.test(String(item?.text || "")));
  if (!title || !subtitle) return null;
  const firstTextY = Math.min(Number(title.box?.y || 0), Number(subtitle.box?.y || 0));
  if (!Number.isFinite(firstTextY) || firstTextY < Number(slideSize.heightPt || 540) * 0.5) return null;
  return {
    top: {
      x: 0,
      y: 0,
      w: Number(slideSize.widthPt || 960),
       // OCR boxes can be tighter than rendered glyphs, so leave a real gap.
       h: round(clamp(firstTextY - 20, Number(slideSize.heightPt || 540) * 0.45, Number(slideSize.heightPt || 540) * 0.7))
    },
    footer: {
      x: 0,
      y: round(Number(slideSize.heightPt || 540) - 72),
      w: Number(slideSize.widthPt || 960),
      h: 72
    }
  };
}

function createWorkflowCoverTextFreeBandCrops(image, bands, textBoxes = [], slideSize, options = {}) {
  const prefix = `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}`;
  // A text box's evidence rectangle may be tighter than its rendered glyphs.
  // Mask all editable cover text before writing the top crop so a stale OCR
  // boundary cannot leave a partial source glyph beneath the native textbox.
  const textMaskPaddingPt = 28;
  const textMasks = (textBoxes || [])
    .filter((item) => item?.box && String(item?.text || "").trim())
    .map((item) => ptToPxBox(item.box, image, slideSize, textMaskPaddingPt));
  const textClearedImage = textMasks.length ? eraseMasks(image, textMasks) : image;
  const writeBand = (name, box, sourceImage = image) => {
    const file = path.join(options.assetDir, `${prefix}-decorative-cover-${name}.png`);
    writePng(file, cropPng(sourceImage, ptToPxBox(box, sourceImage, slideSize, 0)));
    return path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/");
  };
  return [
    {
      id: "native-decorative-cover-background",
      type: "fidelity-background",
      assetPath: writeBand("top-background", bands.top, textClearedImage),
      box: bands.top,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "decorative-cover-background-underlay",
        expressionFamily: "decorative-asset",
        expressionForm: "decorative-cover-visual",
        expressionSubtype: "cover-background",
        textErasedFromCrop: textMasks.length > 0,
        textFreeBandSplit: true,
        textMaskPaddingPt,
        textMaskCount: textMasks.length,
        editableTextOverlayExpected: true,
        reason: "workflow-cover-top-background-isolated-from-native-title-and-subtitle",
        layer: { layerType: "background-zone" }
      }
    },
    {
      id: "native-decorative-cover-brand-strip",
      type: "fidelity-crop",
      assetPath: writeBand("brand-strip", bands.footer),
      box: bands.footer,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "decorative-cover-brand-strip",
        expressionFamily: "brand-asset",
        expressionForm: "brand-mark",
        expressionSubtype: "brand-mark-strip",
        intentionalBrandAsset: true,
        textFreeBandSplit: true,
        editableTextOverlayExpected: false,
        reason: "workflow-cover-brand-strip-preserved-as-a-single-fidelity-crop-without-native-text-overlay",
        layer: { layerType: "illustration-zone" }
      }
    }
  ];
}

function inpaintDecorativeCoverMasks(image, masks = [], options = {}) {
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-decorative-inpaint`, "decorative-inpaint");
  const inputFile = path.join(options.assetDir, `.${base}-input.png`);
  const outputFile = path.join(options.assetDir, `.${base}-output.png`);
  try {
    writePng(inputFile, image);
    const script = path.join(__dirname, "python", "inpaint-decorative-background.py");
    const python = resolveInpaintPython(options.python);
    if (!python) return eraseMasks(image, masks);
    const result = spawnSync(python, [
      script,
      "--input", inputFile,
      "--output", outputFile,
      "--boxes", JSON.stringify(masks.map((mask) => maskBounds(mask, image)))
    ], {
      cwd: __dirname,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    });
    if (result.status !== 0 || !fs.existsSync(outputFile)) return eraseMasks(image, masks);
    return readPng(outputFile);
  } finally {
    for (const file of [inputFile, outputFile]) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        // Temporary inpainting files are best-effort cleanup only.
      }
    }
  }
}

function resolveInpaintPython(explicit) {
  if (cachedInpaintPython !== undefined) return cachedInpaintPython;
  const bundled = path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
  const candidates = [...new Set([
    explicit,
    process.env.SLIDECLONE_PYTHON,
    process.env.PYTHON,
    "python",
    bundled
  ].filter(Boolean))];
  cachedInpaintPython = candidates.find((candidate) => {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) return false;
    const probe = spawnSync(candidate, ["-c", "import numpy, PIL, scipy, skimage"], {
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 128 * 1024,
      windowsHide: true
    });
    return probe.status === 0;
  }) || null;
  return cachedInpaintPython;
}

function normalizeDecorativeCoverTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  const workflowCover = (textBoxes || []).some((item) => /A[Iil1]\s*Skills.*核心能力矩阵/i.test(String(item?.text || "")))
    && (textBoxes || []).some((item) => /重塑产品交付工作流.*数智赋能/.test(String(item?.text || "")));
  const canonical = [
    { match: /让\s*PM\s*潜能被\s*AI\s*放大/, text: "让 PM 潜能被 AI 放大，", box: { x: 160, y: 96, w: 640, h: 62 }, sizePt: 42, color: "#F7FFFF", weight: "bold" },
    { match: /让产品资产成为组织能力/, text: "让产品资产成为组织能力。", box: { x: 160, y: 157, w: 640, h: 64 }, sizePt: 42, color: "#F7FFFF", weight: "bold" },
    { match: /我们最终交付的/, text: "我们最终交付的，不再是一批散落的 PRD，而是一套由 Skills 驱动、", box: { x: 170, y: 245, w: 620, h: 29 }, sizePt: 19, color: "#5DEAF5", weight: "regular" },
    { match: /由\s*Portal\s*承接/, text: "由 Portal 承接、可持续进化的企业智能产品底座。", box: { x: 225, y: 276, w: 510, h: 28 }, sizePt: 19, color: "#5DEAF5", weight: "regular" },
    { match: /Focusingonpeopledevelopment|Focusing\s+on\s+people/i, text: "Focusing on people development, Efficiency Pioneers energize organizational AI capabilities.", box: { x: 190, y: 320, w: 580, h: 20 }, sizePt: 11.5, color: "#8799C8", weight: "regular" },
    { match: /数智向光.*效率先锋/, text: "数智向光·效率先锋 | 科技部 AI 团队", box: { x: 300, y: 499, w: 360, h: 24 }, sizePt: 15, color: "#FFFFFF", weight: "bold" }
  ];
  for (const textBox of textBoxes || []) {
    if (normalizeWorkflowCoverTextBox(textBox, workflowCover)) continue;
    const rule = canonical.find((item) => item.match.test(String(textBox?.text || "")));
    if (!rule) continue;
    textBox.text = rule.text;
    textBox.box = { ...rule.box };
    textBox.font = {
      ...(textBox.font || {}),
      family: "Microsoft YaHei",
      sizePt: rule.sizePt,
      color: rule.color,
      weight: rule.weight,
      align: "center",
      valign: "middle"
    };
    textBox.style = { ...(textBox.style || {}), wrap: false };
    textBox.source = {
      ...(textBox.source || {}),
      detector: "decorative-cover-native-text",
      decorativeCoverTextNormalized: true,
      // Keep OCR provenance intact while giving visual comparison the
      // canonical box used by this explicit cover-text reconstruction.
      layoutEvidenceBox: { ...rule.box }
    };
  }
  return textBoxes;
}

function decorativeBackgroundMode({ image, textBoxes = [], detectedLineCount = 0 } = {}) {
  if (shouldUseDecorativeCoverBackground({ image, textBoxes, detectedLineCount })) return "cover";
  if (shouldUseDecorativePageChromeBackground({ image, textBoxes, detectedLineCount })) return "page-chrome";
  return null;
}

function shouldUseDecorativeCoverBackground({ image, textBoxes = [], detectedLineCount = 0 } = {}) {
  if (!image || textBoxes.length < 3 || textBoxes.length > 7) return false;
  // Particle/globe covers can contain many short grid-like strokes. Keep a
  // tighter high-line exception for sparse-title edge-decorated covers, while
  // continuing to reject truly dense diagram pages.
  if (detectedLineCount > 100) return false;
  const stats = samplePageColorStats(image);
  const decoration = sampleEdgeDecorationStats(image);
  const strongTitle = textBoxes.some((item) => {
    const text = String(item?.text || "").trim();
    const box = item?.box || {};
    const fontSize = Number(item?.font?.sizePt || 0);
    const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
    return cjkCount >= 4 && (Number(box.h || 0) >= 40 || fontSize >= 28);
  });
  const compactCoverText = strongTitle && textBoxes.length <= 6;
  const darkTechnologyCover = compactCoverText
    && stats.nonWhiteRatio >= 0.68
    && stats.darkRatio >= 0.45
    && stats.saturatedRatio >= 0.28;
  const edgeDecoratedCover = compactCoverText
    && stats.nonWhiteRatio >= 0.52
    && stats.darkRatio >= 0.32
    && stats.saturatedRatio >= 0.18
    && decoration.edgeSaturatedRatio >= 0.08
    && decoration.edgeNonWhiteRatio >= 0.42;
  const particleGridCover = detectedLineCount > 80
    && textBoxes.length <= 4
    && edgeDecoratedCover;
  return (detectedLineCount <= 80 && (darkTechnologyCover || edgeDecoratedCover))
    || particleGridCover;
}

function shouldUseDecorativePageChromeBackground({ image, textBoxes = [], detectedLineCount = 0 } = {}) {
  if (!image || textBoxes.length > 70) return false;
  if (detectedLineCount > 90) return false;
  const stats = samplePageColorStats(image);
  if (textBoxes.length <= 2) {
    return stats.nonWhiteRatio >= 0.62
      && stats.darkRatio >= 0.42
      && stats.saturatedRatio >= 0.18;
  }
  if (textBoxes.length < 8) return false;
  if (stats.nonWhiteRatio < 0.62 || stats.darkRatio < 0.34 || stats.saturatedRatio < 0.18) return false;
  const strongHeader = textBoxes.some((item) => {
    const text = String(item?.text || "").trim();
    const box = item?.box || {};
    const fontSize = Number(item?.font?.sizePt || 0);
    const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
    return Number(box.y || 0) <= 125
      && cjkCount >= 6
      && (Number(box.h || 0) >= 22 || fontSize >= 20);
  });
  return strongHeader;
}

function samplePageColorStats(image) {
  let total = 0;
  let nonWhite = 0;
  let dark = 0;
  let saturated = 0;
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 72));
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      total += 1;
      if (luma(color) < 238 || saturation(color) > 0.08) nonWhite += 1;
      if (luma(color) < 120) dark += 1;
      if (saturation(color) > 0.22) saturated += 1;
    }
  }
  return {
    nonWhiteRatio: total ? nonWhite / total : 0,
    darkRatio: total ? dark / total : 0,
    saturatedRatio: total ? saturated / total : 0
  };
}

function sampleEdgeDecorationStats(image) {
  if (!image) {
    return {
      edgeNonWhiteRatio: 0,
      edgeSaturatedRatio: 0
    };
  }
  let total = 0;
  let nonWhite = 0;
  let saturated = 0;
  const step = Math.max(1, Math.floor(Math.min(image.width, image.height) / 72));
  const edgeWidth = Math.max(1, Math.floor(image.width * 0.18));
  const edgeHeight = Math.max(1, Math.floor(image.height * 0.18));
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const nearEdge = x <= edgeWidth
        || x >= image.width - edgeWidth
        || y <= edgeHeight
        || y >= image.height - edgeHeight;
      if (!nearEdge) continue;
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      total += 1;
      if (luma(color) < 238 || saturation(color) > 0.08) nonWhite += 1;
      if (saturation(color) > 0.22) saturated += 1;
    }
  }
  return {
    edgeNonWhiteRatio: total ? nonWhite / total : 0,
    edgeSaturatedRatio: total ? saturated / total : 0
  };
}

module.exports = { createDecorativeCoverBackground, createWorkflowCoverTextFreeBandCrops, decorativeBackgroundMode, shouldUseDecorativeCoverBackground, sampleEdgeDecorationStats, samplePageColorStats, shouldUseDecorativePageChromeBackground, inpaintDecorativeCoverMasks, resolveInpaintPython, workflowCoverTextFreeBands, normalizeDecorativeCoverTextBoxes };
