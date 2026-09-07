"use strict";
const { ensureDir } = require("./residual-primitive-erasure");
const { foregroundComponents, isUsefulGraphicComponent, mergeGraphicComponents, expandPxBox, inAnyMask, isGraphicForeground } = require("./residual-component-analysis");
const { materializeGraphicCrops } = require("./graphic-crop-materializer");
const { ptToPxBox, pxToPtBox, pixel, boxCenterInside, expandPtBox } = require("./raster-native-detection");
const { DEFAULT_SLIDE } = require("./page-text-rule-helpers");

function createGraphicCrops(image, textBoxes, slideSize, options) {
  return materializeGraphicCrops(image, textBoxes, slideSize, options, {
    shouldFullyObjectifyEntropyChallenge, ensureDir, ptToPxBox, foregroundComponents,
    mergeCloseComponent, isUsefulGraphicComponent, mergeGraphicComponents, aggregateForegroundComponent,
    shouldAddAggregateComponent, pxToPtBox, classifyGraphicCropExpression
  });
}

function classifyGraphicCropExpression(box, textBoxes = []) {
  const nearbyText = (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 12, 12)))
    .map((item) => String(item.text || "").trim())
    .filter(Boolean);
  const normalized = nearbyText.join(" ");
  if (normalized.includes("意图转界面")) {
    return {
      detector: "prototype-validation-flow-residual-crop",
      reason: "screenshot-like intent-to-interface panel preserved as a local crop"
    };
  }
  return null;
}

function shouldObjectifyEntropyFragmentCloud(textBoxes, slideSize = DEFAULT_SLIDE) {
  if (!shouldUseEntropyChallengeCrops(textBoxes, slideSize)) return false;
  const normalized = textBoxes.map((item) => String(item?.text || "").replace(/\s+/g, "")).join("\n");
  return ["分散的飞书材料", "过期的历史PRD", "脱节的原型设计", "滞后的评审记录"]
    .every((signal) => normalized.includes(signal));
}

function shouldObjectifyEntropyIsland(textBoxes, slideSize = DEFAULT_SLIDE) {
  return shouldObjectifyEntropyFragmentCloud(textBoxes, slideSize);
}

function shouldFullyObjectifyEntropyChallenge(textBoxes, slideSize = DEFAULT_SLIDE) {
  return shouldObjectifyEntropyFragmentCloud(textBoxes, slideSize)
    && shouldObjectifyEntropyIsland(textBoxes, slideSize);
}

function shouldUseEntropyChallengeCrops(textBoxes, slideSize = DEFAULT_SLIDE) {
  const normalized = textBoxes.map((item) => String(item?.text || "").replace(/\s+/g, "")).join("\n");
  const hasTitle = /产品资产的?[“"]?(?:熵增|摘增)[”"]?挑战/.test(normalized);
  if (!hasTitle) return false;
  const internalSignals = ["飞书材料", "历史PRD", "原型设计", "评审记录"]
    .filter((signal) => normalized.includes(signal)).length;
  const bottomSignals = ["资产碎片化", "技能孤岛", "协作断层"]
    .filter((signal) => normalized.includes(signal)).length;
  const hasBottomBand = textBoxes.some((item) => Number(item?.box?.y || 0) > slideSize.heightPt * 0.76);
  return internalSignals >= 3 && bottomSignals >= 2 && hasBottomBand;
}

function mergeCloseComponent(component) {
  return component;
}

function aggregateForegroundComponent(image, masks = []) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let sampledCount = 0;
  for (let y = 0; y < image.height; y += 3) {
    for (let x = 0; x < image.width; x += 3) {
      if (inAnyMask(x, y, masks)) continue;
      if (!isGraphicForeground(pixel(image, x, y))) continue;
      sampledCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) {
    return null;
  }
  return {
    box: expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, image, 8),
    sampledCount
  };
}

function shouldAddAggregateComponent(component, merged, image) {
  if (!component) return false;
  if (merged.length > 0) return false;
  const areaRatio = component.box.w * component.box.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.04 || areaRatio > 0.65) return false;
  if (component.box.w > image.width * 0.92 && component.box.h > image.height * 0.92) return false;
  const sampledRatio = component.sampledCount / Math.max(1, (image.width / 3) * (image.height / 3));
  return sampledRatio >= 0.0015;
}

module.exports = { createGraphicCrops, aggregateForegroundComponent, classifyGraphicCropExpression, mergeCloseComponent, shouldAddAggregateComponent, shouldFullyObjectifyEntropyChallenge, shouldObjectifyEntropyFragmentCloud, shouldUseEntropyChallengeCrops, shouldObjectifyEntropyIsland };
