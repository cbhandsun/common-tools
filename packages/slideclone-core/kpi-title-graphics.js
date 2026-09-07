"use strict";
const path = require("node:path");
const { kpiEvidenceLayoutBounds } = require("./graphic-crop-analysis");
const { DEFAULT_SLIDE } = require("./page-text-rule-helpers");
const { cropPng, writePng } = require("./png");
const { ensureDir } = require("./residual-primitive-erasure");
const { expandPtBox, ptToPxBox, unionPtBox, clamp, round, pixel } = require("./raster-native-detection");
const { looksLikeTopTitle } = require("./native-text-style");
const { isGraphicForeground } = require("./residual-component-analysis");

function createKpiEvidenceShapes(textBoxes, slideSize = DEFAULT_SLIDE) {
  const layout = kpiEvidenceLayoutBounds(textBoxes, slideSize);
  if (!layout) return [];
  const cardShapes = layout.cards.map((box, index) => ({
    id: `native-kpi-card-${index}`,
    type: "roundRect",
    box,
    style: {
      fill: "#FFFFFF",
      stroke: "#D8D8D8",
      strokeWidthPt: 1,
      radiusRatio: 0.04
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "kpi-evidence-card-container"
    }
  }));
  return [
    {
      id: "native-kpi-title-accent",
      type: "rect",
      box: layout.titleAccent,
      style: {
        fill: "#0D70C8",
        stroke: "none",
        strokeWidthPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "kpi-evidence-title-accent"
      }
    },
    ...cardShapes,
    {
      id: "native-kpi-conclusion-banner",
      type: "roundRect",
      box: layout.banner,
      style: {
        fill: "#F6FBFF",
        stroke: "#1269A4",
        strokeWidthPt: 1.5,
        radiusRatio: 0.08
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "kpi-evidence-conclusion-banner"
      }
    }
  ];
}

function createKpiEvidenceCrops(image, textBoxes, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.assetDir) return [];
  const layout = kpiEvidenceLayoutBounds(textBoxes, slideSize);
  if (!layout) return [];
  ensureDir(options.assetDir);
  const row1 = expandPtBox(unionPtBox(layout.cards[0], layout.cards[1]), slideSize, 3, 3);
  const row2 = expandPtBox(unionPtBox(layout.cards[2], layout.cards[3]), slideSize, 3, 3);
  const banner = expandPtBox(layout.banner, slideSize, 3, 3);
  return [row1, row2, banner].map((box, index) => {
    const pxBox = ptToPxBox(box, image, slideSize, 0);
    const crop = cropPng(image, pxBox);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-kpi-evidence-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      id: `native-kpi-evidence-crop-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "kpi-evidence-crop",
        reason: "kpi-card-figure-preserved-as-local-crops-to-avoid-font-rendering-drift"
      }
    };
  });
}

function createTitleChromeShapes(textBoxes, slideSize = DEFAULT_SLIDE, sourceImage = null) {
  const title = textBoxes.find((item) => looksLikeTopTitle(item));
  if (!title) return [];
  if (/Skill\s*4.*智能评审/i.test(String(title.text || ""))) return [];
  if (/临时问答.*专业\s*AI\s*工作流/.test(String(title.text || ""))) return [];
  if (/破局重构.*A[Iil1]\s*Skills.*工作流/i.test(String(title.text || ""))) return [];
  if (/真实案例证明/.test(String(title.text || ""))) return [];
  if (/量化收益验证|规模化资产复利/.test(String(title.text || ""))) return [];
  if (/终局视野|企业级数字化产品大脑/.test(String(title.text || ""))) return [];
  const box = title.box || {};
  if (Number(box.x || 0) > slideSize.widthPt * 0.14) return [];
  if (sourceImage && !hasTitleAccentEvidence(sourceImage, box, slideSize)) return [];
  const shapes = [{
    id: "native-title-accent",
    type: "rect",
    box: {
      x: round(clamp(Number(box.x || 0) - 13, 24, 56)),
      y: round(clamp(Number(box.y || 0) - 2, 36, 48)),
      w: 3.4,
      h: round(clamp(Number(box.h || 0) + 10, 34, 48))
    },
    style: {
      fill: "#0D70C8",
      stroke: "none",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "title-accent"
    }
  }];
  return shapes;
}

function hasTitleAccentEvidence(sourceImage, titleBox, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !titleBox) return false;
  const accentX = clamp(Number(titleBox.x || 0) - 13, 24, 56);
  const search = ptToPxBox({
    x: accentX - 3,
    y: clamp(Number(titleBox.y || 0) - 4, 0, slideSize.heightPt),
    w: 9.4,
    h: clamp(Number(titleBox.h || 0) + 12, 24, 60)
  }, sourceImage, slideSize, 0);
  const xEnd = Math.min(sourceImage.width, search.x + search.w);
  const yEnd = Math.min(sourceImage.height, search.y + search.h);
  const height = Math.max(1, yEnd - Math.max(0, search.y));
  let strongColumns = 0;
  let maxCoverage = 0;
  for (let x = Math.max(0, search.x); x < xEnd; x += 1) {
    let foreground = 0;
    for (let y = Math.max(0, search.y); y < yEnd; y += 1) {
      if (isGraphicForeground(pixel(sourceImage, x, y))) foreground += 1;
    }
    const coverage = foreground / height;
    maxCoverage = Math.max(maxCoverage, coverage);
    if (coverage >= 0.45) strongColumns += 1;
  }
  return maxCoverage >= 0.62 && strongColumns >= 2;
}

module.exports = { createKpiEvidenceShapes, createKpiEvidenceCrops, createTitleChromeShapes, hasTitleAccentEvidence };
