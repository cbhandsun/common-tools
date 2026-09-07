"use strict";
const { detectColorComponents } = require("./color-component-bounds");
const { ptToPxBox, pxToPtBox, clamp, expandPtBox, pixel } = require("./raster-native-detection");
const { DEFAULT_SLIDE } = require("./page-text-rule-helpers");
const { roundedBox } = require("./prd-generation-shapes");
const { componentMetadata: coverEngineComponentFromRegistry } = require("./cover-engine-core");

function detectCoverAxis(sourceImage, slideSize, regionPt) {
  if (!sourceImage?.rgba) return null;
  const region = ptToPxBox(regionPt, sourceImage, slideSize, 0);
  const components = detectColorComponents(sourceImage, {
    region,
    stride: 2,
    minAreaPx: 1200,
    predicate: (r, g, b, a) => a > 0 && g >= 125 && g - r >= 45 && g - b >= 18
  });
  const component = components.slice().sort((a, b) => b.areaPx - a.areaPx)[0];
  return component ? pxToPtBox(component, sourceImage, slideSize, 0) : null;
}

function detectCoverAvatarBox(sourceImage, slideSize) {
  if (!sourceImage?.rgba) return null;
  const components = detectColorComponents(sourceImage, {
    stride: 2,
    minAreaPx: 900,
    predicate: (r, g, b, a) => a > 0 && r >= 220 && g >= 45 && g <= 145 && b <= 75
  });
  const component = components
    .filter((item) => item.x >= sourceImage.width * 0.72 && item.y <= sourceImage.height * 0.25)
    .sort((a, b) => b.areaPx - a.areaPx)[0];
  return component ? pxToPtBox(component, sourceImage, slideSize, 1) : null;
}

function normalizeCoverEngineCoreChromeTextBoxes(textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  const avatar = detectCoverAvatarBox(sourceImage, slideSize);
  for (const textBox of textBoxes || []) {
    const text = String(textBox?.text || "").trim();
    if (text === "PM Portal Skills 引擎") {
      textBox.font = { ...(textBox.font || {}), family: "DengXian", sizePt: 39, color: "#06345E", weight: "regular", align: "left", opacity: 1 };
    } else if (text === "AI原生产品交付基座") {
      textBox.font = { ...(textBox.font || {}), family: "DengXian", sizePt: 27, color: "#0B355B", weight: "regular", align: "left", opacity: 1 };
    } else if (text === "YH" && avatar) {
      textBox.box = roundedBox({ x: avatar.x, y: avatar.y + avatar.h * 0.22, w: avatar.w, h: avatar.h * 0.56 });
      textBox.font = { ...(textBox.font || {}), family: "Microsoft YaHei", sizePt: 22, color: "#FFFFFF", weight: "regular", align: "center", valign: "middle", opacity: 1 };
      textBox.source = { ...(textBox.source || {}), evidenceBox: textBox.box, detector: "cover-engine-core-native-avatar-label", layerSourceId: "cover-engine-core-page-chrome" };
      Object.assign(textBox.source, coverEngineComponent("avatar", "label"));
    }
  }
}

function coverEngineComponent(group, part) {
  return coverEngineComponentFromRegistry(group, part);
}

function detectCoverCardBox(sourceImage, slideSize, evidenceBox, graphicBox) {
  if (!sourceImage?.rgba || !evidenceBox || !graphicBox) return null;
  const sx = sourceImage.width / slideSize.widthPt;
  const sy = sourceImage.height / slideSize.heightPt;
  const centerX = Math.round((evidenceBox.x + evidenceBox.w / 2) * sx);
  const centerY = Math.round((evidenceBox.y + evidenceBox.h / 2) * sy);
  const graphic = ptToPxBox(expandPtBox(graphicBox, slideSize, 12, 12), sourceImage, slideSize, 0);
  const radiusX = Math.max(90, Math.round(graphic.w * 0.27));
  const radiusY = Math.max(120, Math.round(graphic.h * 0.26));
  const region = {
    x: clamp(centerX - radiusX, graphic.x, graphic.x + graphic.w - 1),
    y: clamp(centerY - radiusY, graphic.y, graphic.y + graphic.h - 1),
    w: 1,
    h: 1
  };
  const right = clamp(centerX + radiusX, region.x + 1, graphic.x + graphic.w);
  const bottom = clamp(centerY + radiusY, region.y + 1, graphic.y + graphic.h);
  region.w = right - region.x;
  region.h = bottom - region.y;
  const leftColumnCounts = [];
  const rightColumnCounts = [];
  for (let x = region.x; x < right; x += 1) {
    let leftCount = 0;
    let rightCount = 0;
    for (let y = region.y; y < bottom; y += 1) {
      if (!isCoverCardBluePixel(pixel(sourceImage, x, y))) continue;
      if (isCoverCardInteriorPixel(pixel(sourceImage, clamp(x + 8, 0, sourceImage.width - 1), y))) leftCount += 1;
      if (isCoverCardInteriorPixel(pixel(sourceImage, clamp(x - 8, 0, sourceImage.width - 1), y))) rightCount += 1;
    }
    leftColumnCounts.push(leftCount);
    rightColumnCounts.push(rightCount);
  }
  const verticalThreshold = Math.max(24, Math.floor(region.h * 0.16));
  const leftBand = projectionBands(leftColumnCounts, verticalThreshold, region.x)
    .filter((band) => band.center < centerX)
    .sort((a, b) => b.center - a.center)[0];
  const rightBand = projectionBands(rightColumnCounts, verticalThreshold, region.x)
    .filter((band) => band.center > centerX)
    .sort((a, b) => a.center - b.center)[0];
  if (!leftBand || !rightBand || rightBand.start - leftBand.end < 70) return null;
  const left = leftBand.start;
  const edgeRight = rightBand.end;
  const topRowCounts = [];
  const bottomRowCounts = [];
  for (let y = region.y; y < bottom; y += 1) {
    let topCount = 0;
    let bottomCount = 0;
    for (let x = left; x <= edgeRight; x += 1) {
      if (!isCoverCardBluePixel(pixel(sourceImage, x, y))) continue;
      if (isCoverCardInteriorPixel(pixel(sourceImage, x, clamp(y + 8, 0, sourceImage.height - 1)))) topCount += 1;
      if (isCoverCardInteriorPixel(pixel(sourceImage, x, clamp(y - 8, 0, sourceImage.height - 1)))) bottomCount += 1;
    }
    topRowCounts.push(topCount);
    bottomRowCounts.push(bottomCount);
  }
  const horizontalThreshold = Math.max(24, Math.floor((edgeRight - left + 1) * 0.24));
  const topBand = projectionBands(topRowCounts, horizontalThreshold, region.y)
    .filter((band) => band.center < centerY)
    .sort((a, b) => b.center - a.center)[0];
  const bottomBand = projectionBands(bottomRowCounts, horizontalThreshold, region.y)
    .filter((band) => band.center > centerY)
    .sort((a, b) => a.center - b.center)[0];
  if (!topBand || !bottomBand || bottomBand.start - topBand.end < 80) return null;
  return pxToPtBox({
    x: left,
    y: topBand.start,
    w: edgeRight - left + 1,
    h: bottomBand.end - topBand.start + 1
  }, sourceImage, slideSize, 0);
}

function projectionBands(counts, threshold, offset = 0) {
  const bands = [];
  let start = -1;
  let maxCount = 0;
  for (let index = 0; index <= counts.length; index += 1) {
    const count = index < counts.length ? counts[index] : 0;
    if (count >= threshold) {
      if (start < 0) start = index;
      maxCount = Math.max(maxCount, count);
      continue;
    }
    if (start < 0) continue;
    const end = index - 1;
    bands.push({
      start: start + offset,
      end: end + offset,
      center: (start + end) / 2 + offset,
      maxCount
    });
    start = -1;
    maxCount = 0;
  }
  return bands;
}

function isCoverCardBluePixel(color) {
  return color.a >= 128
    && color.r <= 105
    && color.g >= 55
    && color.g <= 175
    && color.b >= 135
    && color.b - color.r >= 65
    && color.b - color.g >= 25;
}

function isCoverCardInteriorPixel(color) {
  return color.a >= 128
    && color.r >= 232
    && color.g >= 232
    && color.b >= 232
    && Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) <= 12;
}

module.exports = { detectCoverAxis, detectCoverAvatarBox, normalizeCoverEngineCoreChromeTextBoxes, coverEngineComponent, detectCoverCardBox, isCoverCardBluePixel, isCoverCardInteriorPixel, projectionBands };
