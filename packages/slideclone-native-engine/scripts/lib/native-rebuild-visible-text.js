"use strict";

const fs = require("fs");
const path = require("path");
const {
  expandPtBox,
  luma,
  normalizeHex,
  ptToPxBox,
  rgbToHex,
  saturation,
  sampleInkColor,
  sampleMaskBackgroundColor
} = require("@common-tools/slideclone-core/raster-native-detection");
const {
  inferWeight,
  refineFontSize,
  shouldDisableTextWrap,
  shouldNativeTextBox
} = require("@common-tools/slideclone-core/native-text-style");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function pageImageFile(workDir, page, pageIndex) {
  const candidates = [
    page.sourceImage,
    path.join(workDir, "normalized", `${String(pageIndex + 1).padStart(3, "0")}.png`)
  ].filter(Boolean);
  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? candidate : path.resolve(path.dirname(path.join(workDir, "ir", "deck.json")), candidate);
    if (fs.existsSync(absolute)) return absolute;
    const workRelative = path.resolve(workDir, candidate);
    if (fs.existsSync(workRelative)) return workRelative;
  }
  return null;
}

function visibleTextBoxes(textBoxes, image, slideSize) {
  return textBoxes
    .filter((item) => item && item.box && typeof item.text === "string" && item.text.trim())
    .filter((item) => shouldNativeTextBox(item))
    .map((item) => {
      const next = JSON.parse(JSON.stringify(item));
      next.font = next.font || {};
      next.font.opacity = 1;
      next.font.color = image ? sampleInkColor(image, next.box, slideSize, next.font.color) : normalizeHex(next.font.color, "#111111");
      next.font.sizePt = refineFontSize(next);
      next.font.weight = inferWeight(next, next.font.weight);
      next.font.valign = next.font.valign || "middle";
      next.style = {
        ...(next.style || {}),
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        wrap: false
      };
      if (!shouldDisableTextWrap(next)) delete next.style.wrap;
      next.source = {
        ...(next.source || {}),
        editable: true,
        nativeRebuild: true,
        overlayVisibility: "visible"
      };
      return next;
    });
}

function createTextBackplateShapes(image, textBoxes, slideSize = DEFAULT_SLIDE) {
  return (textBoxes || [])
    .map((textBox, index) => {
      if (!shouldCreateTextBackplate(textBox, slideSize)) return null;
      const pxBox = ptToPxBox(textBox.box, image, slideSize, 5);
      const background = sampleMaskBackgroundColor(image, pxBox);
      if (!isUsefulTextBackplateColor(background)) return null;
      return {
        id: `native-text-backplate-${index}`,
        type: "roundRect",
        box: expandPtBox(textBox.box, slideSize, 6, 3),
        style: {
          fill: rgbToHex(background),
          stroke: "none",
          strokeWidthPt: 0,
          radiusRatio: 0.08
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "sampled-text-backplate"
        }
      };
    })
    .filter(Boolean);
}

function shouldCreateTextBackplate(textBox, slideSize = DEFAULT_SLIDE) {
  const box = textBox?.box || {};
  const font = textBox?.font || {};
  if (!box.w || !box.h) return false;
  if (normalizeHex(font.color, "#111111").toUpperCase() !== "#FFFFFF") return false;
  if (Number(box.w) < 180 || Number(box.h) < 12) return false;
  if (Number(box.w) / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) < 0.22) return false;
  const text = String(textBox?.text || "").trim();
  if (/^产出价值/.test(text)) return false;
  return text.length >= 8;
}

function isUsefulTextBackplateColor(color) {
  return color && luma(color) < 210 && saturation(color) > 0.18;
}

module.exports = {
  createTextBackplateShapes,
  isUsefulTextBackplateColor,
  pageImageFile,
  shouldCreateTextBackplate,
  visibleTextBoxes
};
