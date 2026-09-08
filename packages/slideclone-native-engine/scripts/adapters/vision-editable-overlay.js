"use strict";

const { readPng } = require("../lib/png");

module.exports = async function visionEditableOverlay(input) {
  const slideWidth = input.slideSize?.widthPt || 960;
  const slideHeight = input.slideSize?.heightPt || 540;
  const pageWidth = input.page?.widthPx || input.page?.width || 1;
  const pageHeight = input.page?.heightPx || input.page?.height || 1;
  const image = safeReadPng(input.sourceImage);
  const textOverlayVisibility = normalizeTextOverlayVisibility(input.textOverlayVisibility);
  const textBoxes = (input.ocr?.lines || [])
    .filter((line) => line && line.text && usableBox(line.box))
    .map((line, index) => textBoxFromOcrLine({
      line,
      index,
      pageIndex: input.pageIndex,
      image,
      pageWidth,
      pageHeight,
      textOverlayVisibility
    }));

  return {
    ok: true,
    provider: "vision-editable-overlay",
    data: {
      background: { fill: "#FFFFFF" },
      textBoxes,
      shapes: [],
      images: [{
        id: `p${input.pageIndex}-source-background`,
        type: "source-background",
        box: { x: 0, y: 0, w: slideWidth, h: slideHeight },
        assetPath: input.sourceImage,
        style: {
          opacity: 1,
          assetPath: input.sourceImage,
          strategy: "full-slide-underlay"
        },
        source: {
          pageImage: input.sourceImage,
          visionProvider: "vision-editable-overlay",
          confidence: 1,
          evidenceBox: { x: 0, y: 0, w: slideWidth, h: slideHeight },
          editable: false,
          nonEditableReason: "Full-slide underlay preserves visual fidelity while OCR text is rebuilt as hidden editable overlay text."
        }
      }],
      tables: [],
      charts: [],
      icons: []
    }
  };
};

function textBoxFromOcrLine({ line, index, pageIndex, image, pageWidth, pageHeight, textOverlayVisibility }) {
  const box = roundBox(line.box);
  const color = image ? estimateTextColor(image, box, pageWidth, pageHeight) : "#111111";
  const sizePt = Math.max(6, Math.min(30, round(box.h * 0.72)));
  const hidden = textOverlayVisibility !== "visible";
  return {
    id: `p${pageIndex}-ocr-${String(index + 1).padStart(3, "0")}`,
    role: "body",
    text: String(line.text || ""),
    box,
    font: {
      family: "Microsoft YaHei",
      sizePt,
      color,
      opacity: hidden ? 0 : 1,
      weight: "regular",
      align: "left",
      valign: "middle"
    },
    style: {
      visibility: hidden ? "hidden" : "visible",
      opacity: hidden ? 0 : 1,
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0
    },
    source: {
      pageImage: line.sourceImage,
      ocrProvider: line.provider || "paddleocr-local-v1",
      visionProvider: "vision-editable-overlay",
      confidence: typeof line.confidence === "number" ? line.confidence : null,
      evidenceBox: box,
      editable: true,
      overlayVisibility: hidden ? "hidden" : "visible"
    }
  };
}

function normalizeTextOverlayVisibility(value) {
  const normalized = String(value || "hidden").trim().toLowerCase();
  return normalized === "visible" || normalized === "show" || normalized === "debug" ? "visible" : "hidden";
}

function estimateTextColor(image, box, pageWidth, pageHeight) {
  const pxBox = {
    x: box.x * pageWidth / 960,
    y: box.y * pageHeight / 540,
    w: box.w * pageWidth / 960,
    h: box.h * pageHeight / 540
  };
  const x1 = clamp(Math.floor(pxBox.x), 0, image.width - 1);
  const y1 = clamp(Math.floor(pxBox.y), 0, image.height - 1);
  const x2 = clamp(Math.ceil(pxBox.x + pxBox.w), x1 + 1, image.width);
  const y2 = clamp(Math.ceil(pxBox.y + pxBox.h), y1 + 1, image.height);
  let light = 0;
  let dark = 0;
  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.rgba[offset + 3];
      if (alpha < 128) continue;
      const luma = luminance(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]);
      if (luma >= 190) light += 1;
      if (luma <= 90) dark += 1;
    }
  }
  return light > dark * 1.5 ? "#FFFFFF" : "#111111";
}

function safeReadPng(file) {
  try {
    return readPng(file);
  } catch {
    return null;
  }
}

function usableBox(box) {
  return box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key])) && box.w > 1 && box.h > 1;
}

function roundBox(box) {
  return {
    x: round(box.x),
    y: round(box.y),
    w: round(box.w),
    h: round(box.h)
  };
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports.maxConcurrency = 4;
