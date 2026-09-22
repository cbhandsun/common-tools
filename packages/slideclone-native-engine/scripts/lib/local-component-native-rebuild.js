"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveSmartNativeRebuildOptions } = require("./native-rebuild-options");

function createLocalComponentNativeRebuild({ workDir, outputDir, componentStrategyIndex, componentAssetIndex } = {}) {
  const implementation = require("../rebuild-real-pptx-native");
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") throw new Error("local component native rebuild implementation is unavailable");
  const finalIrDir = path.join(outputDir, "ir");
  const rebuilt = implementation.rebuildDeckFromWorkDir(workDir, {
    ...resolveSmartNativeRebuildOptions({ "smart-native-layers": true }),
    objectifyComponentGroupMatches: true,
    replaceSafeComponentTemplateCrops: true,
    componentStrategyIndex,
    ...(componentAssetIndex ? { componentAssetIndex } : {}),
    assetDir: path.join(outputDir, "assets"),
    irDir: finalIrDir,
    deckName: "component-native"
  });
  return normalizeLocalComponentNativeRebuild(rebuilt, { finalIrDir });
}

function normalizeLocalComponentNativeRebuild(deck, { finalIrDir, nativeIrDir } = {}) {
  const next = cloneJson(deck);
  const finalBase = typeof finalIrDir === "string" && finalIrDir.trim() ? path.resolve(finalIrDir) : "";
  const nativeBase = typeof nativeIrDir === "string" && nativeIrDir.trim() ? path.resolve(nativeIrDir) : finalBase;
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    const pageImage = nonEmptyString(page?.sourceImage) ? page.sourceImage : page?.source?.pageImage;
    const componentLayers = componentLayersForPage(page);
    for (const [collection, items] of objectCollections(page)) {
      for (const item of items) {
        item.source = isPlainObject(item.source) ? item.source : {};
        if (!isBox(item.source.evidenceBox) && isBox(item.box)) item.source.evidenceBox = copyBox(item.box);
        if (!nonEmptyString(item.source.pageImage) && nonEmptyString(pageImage)) item.source.pageImage = pageImage;
        annotateComponentLayerSource(item.source, nearestComponentLayer(item.box, componentLayers));
        if (collection === "images") {
          item.assetPath = normalizeAssetPath(item.assetPath, { finalBase, nativeBase }) || item.assetPath;
          if (item.source.editable !== true && !nonEmptyString(item.source.nonEditableReason)) {
            item.source.nonEditableReason = "component native rebuild retained a local raster asset for visual fidelity";
          }
        }
      }
    }
  }
  return next;
}

function componentLayersForPage(page) {
  return (Array.isArray(page?.images) ? page.images : [])
    .map((image) => ({
      box: image?.box,
      strategy: image?.source?.componentRenderStrategy || image?.source?.layer?.componentRenderStrategy,
      assetLayerKey: image?.source?.componentAssetLayerKey
    }))
    .filter((layer) => isBox(layer.box) && layer.strategy && typeof layer.strategy === "object");
}

function annotateComponentLayerSource(source, layer) {
  if (!layer?.strategy) return;
  source.componentRenderStrategy = source.componentRenderStrategy || layer.strategy;
  if (nonEmptyString(layer.assetLayerKey) && !nonEmptyString(source.componentAssetLayerKey)) source.componentAssetLayerKey = layer.assetLayerKey;
  const targetMotifs = Array.isArray(layer.strategy.targetMotifs) ? layer.strategy.targetMotifs.filter(nonEmptyString) : [];
  if (targetMotifs.length > 0 && !Array.isArray(source.componentTemplateTargetMotifs)) source.componentTemplateTargetMotifs = targetMotifs.slice(0, 12);
}

function nearestComponentLayer(box, layers) {
  if (!isBox(box) || !Array.isArray(layers) || layers.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const layer of layers) {
    const score = boxOverlapScore(box, layer.box);
    if (score > bestScore) {
      best = layer;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function boxOverlapScore(left, right) {
  const a = expandedBox(left);
  const b = expandedBox(right);
  const overlapW = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapH = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlapW * overlapH;
}

function expandedBox(box) {
  const minSize = 2;
  const w = Math.max(minSize, Math.abs(Number(box.w || 0)));
  const h = Math.max(minSize, Math.abs(Number(box.h || 0)));
  return {
    x: Number(box.x || 0) + Math.min(0, Number(box.w || 0)) - (w === minSize ? minSize / 2 : 0),
    y: Number(box.y || 0) + Math.min(0, Number(box.h || 0)) - (h === minSize ? minSize / 2 : 0),
    w,
    h
  };
}

function normalizeAssetPath(assetPath, { finalBase, nativeBase }) {
  if (!nonEmptyString(assetPath) || !finalBase) return "";
  const candidates = [];
  if (path.isAbsolute(assetPath)) candidates.push(path.resolve(assetPath));
  else {
    if (nativeBase) candidates.push(path.resolve(nativeBase, assetPath));
    candidates.push(path.resolve(finalBase, assetPath));
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return "";
  return path.relative(finalBase, found).replace(/\\/g, "/");
}

function objectCollections(page) {
  return ["textBoxes", "shapes", "images", "tables", "charts", "icons"]
    .map((name) => [name, Array.isArray(page?.[name]) ? page[name] : []]);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBox(box) {
  return isPlainObject(box) && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]));
}

function copyBox(box) {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createLocalComponentNativeRebuild,
  normalizeLocalComponentNativeRebuild
};
