"use strict";
const path = require("node:path");
const { normalizeMatrixLabel } = require("./diagram-label-matching");
const { boxCenterInside, expandPtBox, round, ptToPxBox, centerOfBox, rgbToHsl } = require("./raster-native-detection");
const { cropPng, writePng } = require("./png");
const { ensureDir, eraseMasks, resolveAssetPathForIr } = require("./residual-primitive-erasure");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function pointInsidePtBox(x, y, box) {
  return x >= Number(box.x || 0)
    && x <= Number(box.x || 0) + Number(box.w || 0)
    && y >= Number(box.y || 0)
    && y <= Number(box.y || 0) + Number(box.h || 0);
}

function maybeEraseSegmentedComparisonMatrixText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  const visibleTextBoxes = visibleSegmentedComparisonMatrixTextBoxes(image, textBoxes, slideSize, sourceImage);
  if (visibleTextBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = visibleTextBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 7));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return visibleTextBoxes;
}

function visibleSegmentedComparisonMatrixTextBoxes(image, textBoxes = [], slideSize = DEFAULT_SLIDE, sourceImage = null) {
  const box = image?.box || {};
  if (image?.source?.detector !== "comparison-matrix-crop") return [];
  const labels = textBoxes.map((item) => normalizeMatrixLabel(item.text)).join("\n");
  if (Number(box.x || 0) >= Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * 0.55) {
    if (textBoxes.length < 3 || textBoxes.length > 8) return [];
    return /PM\s*Portal\s*AI\s*Skills|PMPortalAISkills|深度结合|PRD|前置拦截|自动落盘/.test(labels)
      ? textBoxes
      : [];
  }
  return textBoxes.filter((item) => isLowRiskLeftComparisonMatrixTextBox(image, item, sourceImage, slideSize));
}

function isLowRiskLeftComparisonMatrixTextBox(image, textBox, sourceImage = null, slideSize = DEFAULT_SLIDE) {
  const atoms = image?.source?.layer?.visualAtoms || [];
  const center = centerOfBox(textBox.box);
  const hit = atoms.find((atom) => atom?.box && pointInsidePtBox(center.x, center.y, atom.box));
  const text = normalizeMatrixLabel(textBox.text);
  if (!text || text === "+") return false;
  if (!hit || hit.nativeCandidate !== true) return false;
  const kind = String(hit.kind || "");
  if (/^native-(document|rect|ellipse)-candidate$/.test(kind)) return true;
  if (kind === "connector-line-candidate") {
    return isTextBoxOnSafeComparisonMatrixBackground(textBox, sourceImage, slideSize);
  }
  return false;
}

function isTextBoxOnSafeComparisonMatrixBackground(textBox, sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !textBox?.box) return false;
  const box = ptToPxBox(textBox.box, sourceImage, slideSize, 7);
  let total = 0;
  let strongColor = 0;
  let blueStroke = 0;
  let dark = 0;
  let lightSum = 0;
  for (let y = box.y; y < box.y + box.h; y += 2) {
    for (let x = box.x; x < box.x + box.w; x += 2) {
      const offset = (y * sourceImage.width + x) * 4;
      const color = {
        r: sourceImage.rgba[offset],
        g: sourceImage.rgba[offset + 1],
        b: sourceImage.rgba[offset + 2]
      };
      const hsl = rgbToHsl(color);
      const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
      total += 1;
      lightSum += luminance;
      if (hsl.s > 0.35 && hsl.l > 0.12 && hsl.l < 0.8) strongColor += 1;
      if (hsl.h >= 185 && hsl.h <= 235 && hsl.s > 0.25 && hsl.l < 0.72) blueStroke += 1;
      if (luminance < 95) dark += 1;
    }
  }
  if (total === 0) return false;
  const strongColorRatio = strongColor / total;
  const blueStrokeRatio = blueStroke / total;
  const darkRatio = dark / total;
  const avgLuminance = lightSum / total;
  if (avgLuminance < 145) return false;
  if (strongColorRatio > 0.035 || blueStrokeRatio > 0.025) return false;
  if (darkRatio > 0.24) return false;
  return true;
}

function comparisonMatrixTextKey(item) {
  const box = item?.box || {};
  return `${normalizeMatrixLabel(item?.text)}:${round(box.x || 0)}:${round(box.y || 0)}:${round(box.w || 0)}:${round(box.h || 0)}`;
}

function visibleComparisonMatrixTextBox(item, image) {
  const box = image?.box || {};
  const next = JSON.parse(JSON.stringify(item));
  const font = next.font || {};
  const role = String(next.source?.role || "");
  next.font = {
    ...font,
    color: role === "column-header" ? "#FFFFFF" : (font.color || "#FFFFFF"),
    opacity: 1,
    weight: role === "column-header" ? "bold" : (font.weight || "regular")
  };
  next.source = {
    ...(next.source || {}),
    detector: "comparison-matrix-native-visible-label",
    layerSourceId: image?.id || null,
    overlayVisibility: "visible",
    textErasedFromCrop: true
  };
  next.box = {
    x: round(Math.max(Number(box.x || 0) + 8, Number(next.box.x || 0))),
    y: round(Number(next.box.y || 0)),
    w: round(Number(next.box.w || 0)),
    h: round(Number(next.box.h || 0))
  };
  return next;
}

function comparisonMatrixSegmentNativeTextBoxes(image, textBoxes = []) {
  return comparisonMatrixInternalTextBoxes(image, textBoxes)
    .filter((item) => normalizeMatrixLabel(item.text) !== "+")
    .map((item) => comparisonMatrixSegmentTextBox(item, image.box));
}

function comparisonMatrixInternalTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  return (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 4, 4)))
    .sort((a, b) => (Number(a.box?.y || 0) - Number(b.box?.y || 0)) || (Number(a.box?.x || 0) - Number(b.box?.x || 0)));
}

function comparisonMatrixSegmentTextBox(item, matrixBox) {
  const originalFont = item.font || {};
  const text = normalizeMatrixLabel(item.text);
  const center = {
    x: Number(item.box?.x || 0) + Number(item.box?.w || 0) / 2,
    y: Number(item.box?.y || 0) + Number(item.box?.h || 0) / 2
  };
  const isHeader = center.y < Number(matrixBox.y || 0) + Number(matrixBox.h || 0) * 0.18;
  const isRowHeader = center.x < Number(matrixBox.x || 0) + Number(matrixBox.w || 0) * 0.22;
  return {
    text: text.replace(/PM\s*Portal\s*AI\s*Skills|PMPortalAISkills/g, "PM Portal AI Skills"),
    box: {
      x: round(item.box.x),
      y: round(item.box.y),
      w: round(item.box.w),
      h: round(item.box.h)
    },
    font: {
      family: originalFont.family || "Microsoft YaHei",
      sizePt: Number(originalFont.sizePt || 0) > 0 ? originalFont.sizePt : (isHeader ? 14.5 : 12.5),
      color: originalFont.color || (isHeader || isRowHeader ? "#FFFFFF" : "#111111"),
      opacity: 0,
      weight: originalFont.weight || (isHeader || isRowHeader ? "bold" : "regular"),
      align: originalFont.align || "left",
      valign: originalFont.valign || "middle"
    },
    source: {
      ...(item.source || {}),
      editable: true,
      nativeRebuild: true,
      detector: "comparison-matrix-native-hidden-label",
      layerSourceId: null,
      role: isHeader ? "column-header" : (isRowHeader ? "row-header" : "cell"),
      overlayVisibility: "hidden",
      preservedFromCrop: true
    }
  };
}

function comparisonMatrixTextBox(item, matrixBox, xLines, yLines) {
  const text = normalizeMatrixLabel(item.text);
  const center = { x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2 };
  const isHeader = center.y < yLines[0];
  const isRowHeader = center.x < xLines[0] && center.y >= yLines[0];
  const isPortalHeader = /PM\s*Portal\s*Skills|PMPortalSkills/.test(text);
  const role = isHeader ? "column-header" : (isRowHeader ? "row-header" : "cell");
  const displayText = isPortalHeader ? "PM Portal Skills 引擎" : text;
  return {
    id: item.id || comparisonMatrixNativeTextBoxId(displayText, item.box, role),
    text: displayText,
    box: {
      x: round(item.box.x),
      y: round(item.box.y),
      w: round(item.box.w),
      h: round(item.box.h)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: isHeader ? 18 : 17,
      color: isHeader || isRowHeader ? "#145B73" : "#111111",
      opacity: 1,
      weight: isHeader || isRowHeader ? "bold" : "regular",
      align: "left",
      valign: "middle"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "comparison-matrix-native-label",
      role
    }
  };
}

function comparisonMatrixNativeTextBoxId(text, box = {}, role = "cell") {
  const stem = String(text || "label")
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "")
    .slice(0, 32) || "label";
  return `comparison-matrix-${role}-${stem}-${Math.round(Number(box.x || 0))}-${Math.round(Number(box.y || 0))}`;
}

module.exports = { comparisonMatrixSegmentNativeTextBoxes, comparisonMatrixInternalTextBoxes, comparisonMatrixSegmentTextBox, comparisonMatrixTextKey, maybeEraseSegmentedComparisonMatrixText, visibleSegmentedComparisonMatrixTextBoxes, isLowRiskLeftComparisonMatrixTextBox, isTextBoxOnSafeComparisonMatrixBackground, pointInsidePtBox, visibleComparisonMatrixTextBox, comparisonMatrixTextBox, comparisonMatrixNativeTextBoxId };
