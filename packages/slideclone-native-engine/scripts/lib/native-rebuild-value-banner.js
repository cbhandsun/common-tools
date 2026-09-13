"use strict";

const fs = require("fs");
const { classifyImageExpressionForm } = require("@common-tools/slideclone-core/diagram-residual-crops");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { resolveAssetPathForIr } = require("@common-tools/slideclone-core/residual-primitive-erasure");
const {
  averageColor,
  boxCenterInside,
  clamp,
  colorDistance,
  luma,
  pixel,
  ptToPxBox,
  rgbToHex,
  round,
  saturation,
  trimPxBox
} = require("@common-tools/slideclone-core/raster-native-detection");
const { readPng } = require("./png");

function createValueBannerBackgroundShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyValueBanner(image, textBoxes, slideSize)) continue;
    const sampled = sampleStableValueBannerFill(sourceImage, image.box, slideSize)
      || sampleStableValueBannerFillFromAsset(image, textBoxes, slideSize, irDir)
      || sampleWideValueBannerGradientFill(sourceImage, image, slideSize)
      || sampleApproximateWideValueBannerFill(sourceImage, image, slideSize);
    if (!sampled) continue;
    image.source = {
      ...(image.source || {}),
      valueBannerObjectified: true,
      objectifiedValueBannerFill: sampled.fill,
      ...(sampled.approximate ? { objectifiedValueBannerApproximateFill: true } : {}),
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; replaced by native value banner background`
    };
    const gradientShape = semanticCycleValueBannerGradientShape(image, textBoxes, sampled);
    if (gradientShape) {
      image.source.objectifiedValueBannerGradientStops = gradientShape.style.gradient.stops.length;
      image.source.objectifiedValueBannerGradientNativeShape = true;
      shapes.push(gradientShape);
      continue;
    }
    if (sampled.gradientStops) {
      image.source.objectifiedValueBannerGradientStops = sampled.gradientStops.length;
      image.source.objectifiedValueBannerGradientNativeShape = true;
      image.source.objectifiedValueBannerApproximateGradient = true;
      shapes.push(wideValueBannerGradientShape(image, sampled));
      continue;
    }
    shapes.push({
      id: `${image.id || "value-banner"}-native-background`,
      type: "rect",
      box: image.box,
      style: {
        fill: sampled.fill,
        stroke: "none",
        strokeWidthPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "value-banner-native-background",
        expressionForm: "value-banner",
        expressionSubtype: image.source?.expressionSubtype || "value-banner-strip",
        layerSourceId: image.id || null,
        colorVariance: sampled.meanDistance,
        dominantCoverage: sampled.dominantCoverage,
        ...(sampled.approximate ? { approximateFill: true } : {})
      }
    });
  }
  return shapes;
}

function wideValueBannerGradientShape(image, sampled = {}) {
  const box = image.box || {};
  return {
    id: `${image.id || "value-banner"}-native-wide-gradient`,
    type: "rect",
    box: {
      x: round(box.x),
      y: round(box.y),
      w: round(box.w),
      h: round(box.h)
    },
    style: {
      fill: sampled.fill || sampled.gradientStops?.[1]?.color || "#167E73",
      stroke: "none",
      strokeWidthPt: 0,
      gradient: {
        type: "linear",
        angleDeg: 0,
        stops: sampled.gradientStops || []
      }
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "value-banner-native-wide-gradient-background",
      expressionForm: "value-banner",
      expressionSubtype: image.source?.expressionSubtype || "value-banner-strip",
      layerSourceId: image.id || null,
      gradientStopCount: Array.isArray(sampled.gradientStops) ? sampled.gradientStops.length : 0,
      colorVariance: sampled.meanDistance,
      approximateGradient: true
    }
  };
}

function semanticCycleValueBannerGradientShape(image, textBoxes = [], sampled = {}) {
  if (!isSemanticCycleValueBanner(image, textBoxes)) return null;
  const box = image.box || {};
  const left = "#0B69A6";
  const middle = sampled.fill || "#167E73";
  const right = "#249A42";
  return {
    id: `${image.id || "value-banner"}-native-gradient`,
    type: "rect",
    box: {
      x: round(box.x),
      y: round(box.y),
      w: round(box.w),
      h: round(box.h)
    },
    style: {
      fill: middle,
      stroke: "none",
      strokeWidthPt: 0,
      gradient: {
        type: "linear",
        angleDeg: 0,
        stops: [
          { position: 0, color: left },
          { position: 0.52, color: middle },
          { position: 1, color: right }
        ]
      }
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "value-banner-native-gradient-background",
      expressionForm: "value-banner",
      expressionSubtype: image.source?.expressionSubtype || "value-banner-strip",
      layerSourceId: image.id || null,
      gradientStopCount: 3,
      colorVariance: sampled.meanDistance,
      dominantCoverage: sampled.dominantCoverage
    }
  };
}

function isSemanticCycleValueBanner(image, textBoxes = []) {
  const source = image?.source || {};
  if (source.expressionSubtype !== "value-banner-strip") return false;
  if (!/saturated-diagram-bottom-banner|semantic-cycle|value-banner/i.test(String(image?.id || ""))) return false;
  return (textBoxes || []).some((textBox) =>
    /^产出价值/.test(String(textBox?.text || "").trim())
    && boxCenterInside(textBox.box, image.box)
  );
}

function sampleStableValueBannerFillFromAsset(image, textBoxes = [], _slideSize = DEFAULT_SLIDE, irDir = null) {
  const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, image.box)).length;
  if (internalTextCount <= 0) return null;
  const assetFile = resolveAssetPathForIr(image?.assetPath, irDir);
  if (!assetFile || !fs.existsSync(assetFile)) return null;
  let cropImage;
  try {
    cropImage = readPng(assetFile);
  } catch {
    return null;
  }
  return sampleStableValueBannerFill(
    cropImage,
    { x: 0, y: 0, w: image.box.w, h: image.box.h },
    { widthPt: image.box.w, heightPt: image.box.h }
  );
}

function shouldObjectifyValueBanner(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const source = image?.source || {};
  const box = image?.box || {};
  const expression = source.expressionForm || classifyImageExpressionForm(image);
  if (expression !== "value-banner") return false;
  if (!box.w || !box.h) return false;
  if (Number(box.w) / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) < 0.45) return false;
  if (Number(box.h) < 28 || Number(box.h) > 120) return false;
  const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;
  if (internalTextCount >= 4) return false;
  return true;
}

function sampleStableValueBannerFill(sourceImage, box, slideSize = DEFAULT_SLIDE) {
  const pxBox = trimPxBox(ptToPxBox(box, sourceImage, slideSize, 0), sourceImage, 6);
  const insetX = Math.floor(pxBox.w * 0.08);
  const insetY = Math.floor(pxBox.h * 0.18);
  const sampleBox = {
    x: clamp(pxBox.x + insetX, 0, sourceImage.width - 1),
    y: clamp(pxBox.y + insetY, 0, sourceImage.height - 1),
    w: 1,
    h: 1
  };
  sampleBox.w = clamp(pxBox.w - insetX * 2, 1, sourceImage.width - sampleBox.x);
  sampleBox.h = clamp(pxBox.h - insetY * 2, 1, sourceImage.height - sampleBox.y);
  const stride = Math.max(2, Math.floor(Math.min(sampleBox.w, sampleBox.h) / 16));
  const colors = [];
  for (let y = sampleBox.y; y < sampleBox.y + sampleBox.h; y += stride) {
    for (let x = sampleBox.x; x < sampleBox.x + sampleBox.w; x += stride) {
      const color = pixel(sourceImage, x, y);
      if (color.a >= 200) colors.push(color);
    }
  }
  if (colors.length < 12) return null;
  const average = averageColor(colors);
  const meanDistance = colors.reduce((sum, color) => sum + colorDistance(color, average), 0) / colors.length;
  if (meanDistance > 42) {
    return dominantStableValueBannerFill(colors);
  }
  if (luma(average) > 245 && saturation(average) < 0.04) return null;
  return {
    fill: rgbToHex(average),
    meanDistance: round(meanDistance)
  };
}

function sampleWideValueBannerGradientFill(sourceImage, image = {}, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !isApproximateWideValueBannerCandidate(image, slideSize)) return null;
  const pxBox = trimPxBox(ptToPxBox(image.box, sourceImage, slideSize, 0), sourceImage, 6);
  const insetY = Math.floor(pxBox.h * 0.22);
  const band = {
    x: pxBox.x,
    y: clamp(pxBox.y + insetY, 0, sourceImage.height - 1),
    w: pxBox.w,
    h: clamp(pxBox.h - insetY * 2, 1, sourceImage.height)
  };
  band.h = clamp(band.h, 1, sourceImage.height - band.y);
  const segments = [0.16, 0.5, 0.84].map((center) => {
    const segmentWidth = Math.max(8, Math.floor(band.w * 0.16));
    return sampleValueBannerSegment(sourceImage, {
      x: clamp(Math.floor(band.x + band.w * center - segmentWidth / 2), 0, sourceImage.width - 1),
      y: band.y,
      w: segmentWidth,
      h: band.h
    });
  });
  if (segments.some((segment) => !segment || segment.meanDistance > 74)) return null;
  if (segments.every((segment) => saturation(segment.average) < 0.10)) return null;
  const contrast = colorDistance(segments[0].average, segments[2].average);
  if (contrast < 38) return null;
  return {
    fill: rgbToHex(segments[1].average),
    meanDistance: round(Math.max(...segments.map((segment) => segment.meanDistance))),
    gradientStops: [
      { position: 0, color: rgbToHex(segments[0].average) },
      { position: 0.5, color: rgbToHex(segments[1].average) },
      { position: 1, color: rgbToHex(segments[2].average) }
    ]
  };
}

function sampleValueBannerSegment(sourceImage, box = {}) {
  const sampleBox = {
    x: clamp(Math.floor(box.x || 0), 0, sourceImage.width - 1),
    y: clamp(Math.floor(box.y || 0), 0, sourceImage.height - 1),
    w: clamp(Math.floor(box.w || 1), 1, sourceImage.width),
    h: clamp(Math.floor(box.h || 1), 1, sourceImage.height)
  };
  sampleBox.w = clamp(sampleBox.w, 1, sourceImage.width - sampleBox.x);
  sampleBox.h = clamp(sampleBox.h, 1, sourceImage.height - sampleBox.y);
  const stride = Math.max(2, Math.floor(Math.min(sampleBox.w, sampleBox.h) / 12));
  const colors = [];
  for (let y = sampleBox.y; y < sampleBox.y + sampleBox.h; y += stride) {
    for (let x = sampleBox.x; x < sampleBox.x + sampleBox.w; x += stride) {
      const color = pixel(sourceImage, x, y);
      if (color.a >= 200) colors.push(color);
    }
  }
  if (colors.length < 10) return null;
  const average = averageColor(colors);
  if (luma(average) > 242 && saturation(average) < 0.06) return null;
  const meanDistance = colors.reduce((sum, color) => sum + colorDistance(color, average), 0) / colors.length;
  return { average, meanDistance };
}

function sampleApproximateWideValueBannerFill(sourceImage, image = {}, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !isApproximateWideValueBannerCandidate(image, slideSize)) return null;
  const pxBox = trimPxBox(ptToPxBox(image.box, sourceImage, slideSize, 0), sourceImage, 6);
  const insetX = Math.floor(pxBox.w * 0.06);
  const insetY = Math.floor(pxBox.h * 0.22);
  const sampleBox = {
    x: clamp(pxBox.x + insetX, 0, sourceImage.width - 1),
    y: clamp(pxBox.y + insetY, 0, sourceImage.height - 1),
    w: clamp(pxBox.w - insetX * 2, 1, sourceImage.width),
    h: clamp(pxBox.h - insetY * 2, 1, sourceImage.height)
  };
  sampleBox.w = clamp(sampleBox.w, 1, sourceImage.width - sampleBox.x);
  sampleBox.h = clamp(sampleBox.h, 1, sourceImage.height - sampleBox.y);
  const stride = Math.max(2, Math.floor(Math.min(sampleBox.w, sampleBox.h) / 18));
  const colors = [];
  for (let y = sampleBox.y; y < sampleBox.y + sampleBox.h; y += stride) {
    for (let x = sampleBox.x; x < sampleBox.x + sampleBox.w; x += stride) {
      const color = pixel(sourceImage, x, y);
      if (color.a >= 200) colors.push(color);
    }
  }
  if (colors.length < 18) return null;
  const average = averageColor(colors);
  const meanDistance = colors.reduce((sum, color) => sum + colorDistance(color, average), 0) / colors.length;
  if (meanDistance > 92) return null;
  if (luma(average) > 238 && saturation(average) < 0.08) return null;
  if (saturation(average) < 0.10) return null;
  return {
    fill: rgbToHex(average),
    meanDistance: round(meanDistance),
    approximate: true
  };
}

function isApproximateWideValueBannerCandidate(image = {}, slideSize = DEFAULT_SLIDE) {
  const source = image?.source || {};
  const box = image?.box || {};
  const detector = String(source.detector || "").toLowerCase();
  if (!/bottom-banner-crop|value-banner/.test(detector)) return false;
  const widthRatio = Number(box.w || 0) / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const yRatio = Number(box.y || 0) / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  if (widthRatio < 0.88 || yRatio < 0.72) return false;
  if (Number(box.h || 0) < 36 || Number(box.h || 0) > 110) return false;
  return true;
}

function dominantStableValueBannerFill(colors) {
  const buckets = new Map();
  for (const color of colors) {
    const key = quantizeColorKey(color, 32);
    const bucket = buckets.get(key) || [];
    bucket.push(color);
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.length - a.length)[0] || [];
  const coverage = dominant.length / Math.max(1, colors.length);
  if (coverage < 0.44) return null;
  const average = averageColor(dominant);
  if (luma(average) > 245 && saturation(average) < 0.04) return null;
  const meanDistance = dominant.reduce((sum, color) => sum + colorDistance(color, average), 0) / dominant.length;
  if (meanDistance > 58) return null;
  return {
    fill: rgbToHex(average),
    meanDistance: round(meanDistance),
    dominantCoverage: round(coverage)
  };
}

function quantizeColorKey(color, step = 32) {
  return [
    Math.round(color.r / step) * step,
    Math.round(color.g / step) * step,
    Math.round(color.b / step) * step
  ].join(",");
}

module.exports = {
  createValueBannerBackgroundShapes
};
