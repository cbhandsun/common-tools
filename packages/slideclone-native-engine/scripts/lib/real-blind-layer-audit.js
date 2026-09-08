"use strict";

const fs = require("fs");
const path = require("path");
const { readPng } = require("./png");
const { classifyVisualLayer } = require("./layer-classifier");

let cachedNativeShapeFactory = null;

function auditRealIrBlindLayers(irFile, options = {}) {
  const auditStartedAt = process.hrtime.bigint();
  const absoluteIrFile = path.resolve(String(irFile || ""));
  const ir = parseIr(absoluteIrFile);
  const baseDir = path.dirname(absoluteIrFile);
  const readImage = options.readImage || readPng;
  const classifyLayer = options.classifyLayer || classifyVisualLayer;
  const createNativeShapes = options.createNativeShapes || defaultNativeShapeFactory();
  const layers = [];
  for (const [fallbackPageIndex, page] of (ir.pages || []).entries()) {
    for (const image of page.images || []) {
      const assetRef = imageAssetReference(image);
      if (!assetRef) continue;
      const assetFile = resolveContainedAsset(baseDir, assetRef);
      const layerStartedAt = process.hrtime.bigint();
      const canvasScale = chooseCanvasScale(image.box, ir.slideSize, options.canvasScale);
      const sourceImage = placeAssetOnSlideCanvas(readImage(assetFile), image.box, ir.slideSize, canvasScale);
      const blindItem = {
        id: `blind-${String(image.id || layers.length + 1)}`,
        type: "image",
        box: image.box,
        source: { detector: "generic-visual-underlay" }
      };
      const blind = classifyLayer(blindItem, { textBoxes: [] }, ir.slideSize, { sourceImage });
      const protectedMinimumUnit = isProtectedMinimumUnit(image);
      const stronglyProtectedMinimumUnit = isStronglyProtectedMinimumUnit(image);
      const blindRenderableItem = { ...blindItem, source: { ...blindItem.source, layer: blind } };
      const blindNativeShapes = createNativeShapes([blindRenderableItem]) || [];
      const blindDropsSourceCrop = blindRenderableItem.source?.dropErasedResidualAfterNativeRebuild === true
        || blindRenderableItem.source?.visualAtomFullyObjectified === true;
      const issues = [];
      if (protectedMinimumUnit && blind.recommendedAction === "attempt-native-reconstruction") {
        issues.push("protected-minimum-unit-promoted-to-native");
      }
      if (protectedMinimumUnit && blind.diagramUnderstanding?.nativeReadiness === "native-rebuild") {
        issues.push("protected-minimum-unit-marked-native-ready");
      }
      if (stronglyProtectedMinimumUnit && blindDropsSourceCrop) {
        issues.push("strongly-protected-minimum-unit-source-crop-dropped-by-native-shell");
      }
      layers.push({
        pageIndex: page.pageIndex ?? fallbackPageIndex,
        imageId: image.id || null,
        asset: assetRef,
        protectedMinimumUnit,
        stronglyProtectedMinimumUnit,
        originalAction: image.source?.layer?.recommendedAction || image.source?.recommendation || null,
        blindLayerType: blind.layerType,
        blindAction: blind.recommendedAction,
        blindArchetype: blind.diagramUnderstanding?.archetype || null,
        blindReadiness: blind.diagramUnderstanding?.nativeReadiness || null,
        blindResidualCount: Number(blind.diagramUnderstanding?.residualCount || 0),
        blindNativeShapeCount: blindNativeShapes.length,
        blindNativeShapeDetectors: [...new Set(blindNativeShapes.map((shape) => shape?.source?.detector).filter(Boolean))],
        blindDropsSourceCrop,
        blindNativeOverlayOnly: blindNativeShapes.length > 0 && !blindDropsSourceCrop,
        canvasScale,
        durationMs: elapsedMs(layerStartedAt),
        issues,
        passed: issues.length === 0
      });
    }
  }
  const issues = layers.flatMap((layer) => layer.issues.map((issue) => ({ pageIndex: layer.pageIndex, imageId: layer.imageId, issue })));
  return {
    provider: "real-blind-layer-audit-v1",
    irFile: absoluteIrFile,
    layerCount: layers.length,
    protectedMinimumUnitCount: layers.filter((layer) => layer.protectedMinimumUnit).length,
    issueCount: issues.length,
    durationMs: elapsedMs(auditStartedAt),
    passed: issues.length === 0,
    issues,
    layers
  };
}

function defaultNativeShapeFactory() {
  if (!cachedNativeShapeFactory) {
    cachedNativeShapeFactory = require("../rebuild-real-pptx-native").createVisualAtomNativeShapes;
  }
  return cachedNativeShapeFactory;
}

function chooseCanvasScale(box = {}, slideSize = {}, requestedScale = "auto") {
  if (requestedScale !== undefined && requestedScale !== null && requestedScale !== "auto") {
    const numericScale = Number(requestedScale);
    if (!Number.isFinite(numericScale) || numericScale < 1 || numericScale > 4) {
      throw new Error(`canvasScale must be auto or a number from 1 to 4: ${requestedScale}`);
    }
    return Math.round(numericScale);
  }
  const slideArea = Math.max(1, Number(slideSize.widthPt || 0) * Number(slideSize.heightPt || 0));
  const layerArea = Math.max(0, Number(box.w || 0) * Number(box.h || 0));
  // Tiny crops need supersampling for thin icon strokes. Larger layers are both
  // faster and less prone to UI-texture false positives at native resolution.
  return layerArea / slideArea < 0.02 ? 2 : 1;
}

function elapsedMs(startedAt) {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

function parseIr(file) {
  if (!file || !fs.existsSync(file)) throw new Error(`IR file does not exist: ${file}`);
  let ir;
  try {
    ir = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Invalid IR JSON: ${file}: ${error.message}`);
  }
  if (!ir || !Array.isArray(ir.pages)) throw new Error(`IR pages must be an array: ${file}`);
  if (![ir.slideSize?.widthPt, ir.slideSize?.heightPt].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) {
    throw new Error(`IR slideSize is invalid: ${file}`);
  }
  return ir;
}

function imageAssetReference(image = {}) {
  const value = image.assetPath || image.path || image.source?.assetPath || image.source?.file;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveContainedAsset(baseDir, assetRef) {
  const file = path.resolve(baseDir, assetRef);
  const relative = path.relative(baseDir, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Asset path must stay inside the IR directory: ${assetRef}`);
  }
  if (!fs.existsSync(file)) throw new Error(`IR asset does not exist: ${file}`);
  return file;
}

function isProtectedMinimumUnit(image = {}) {
  const source = image.source || {};
  if (source.protectedMinimumUnit === true || source.intentionalMinimumUnitCrop === true || source.minimumUnitPolicy) return true;
  if (source.layer?.recommendedAction === "preserve-local-crop" || source.recommendation === "preserve-local-crop") return true;
  const text = [source.detector, source.expressionForm, source.expressionSubtype, source.reason]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /minimum[-_\s]?unit|icon[-_\s]?crop|screenshot|ui[-_\s]?capture|document[-_\s]?region|residual[-_\s]?crop|icon-or-illustration/.test(text);
}

function isStronglyProtectedMinimumUnit(image = {}) {
  const source = image.source || {};
  if (source.protectedMinimumUnit === true || source.intentionalMinimumUnitCrop === true || source.minimumUnitPolicy) return true;
  if (image.type === "fidelity-background") return true;
  const text = [
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.expressionRecommendation,
    source.recommendedAction,
    source.recommendation,
    source.reason
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /screenshot|ui[-_\s]?capture|ui[-_\s]?screenshot|document|icon-or-illustration|illustration|icon[-_\s]?(?:crop|residual)|chart-snapshot|decorative|fidelity-background|entropy|product-illustration|residual[-_\s]?crop|keep-local-crop|match-icon-library/.test(text);
}

function placeAssetOnSlideCanvas(asset, box = {}, slideSize = {}, requestedScale = 2) {
  if (!asset?.rgba || !Number.isInteger(asset.width) || !Number.isInteger(asset.height)) throw new Error("Layer asset image is invalid");
  const scale = Math.max(1, Math.min(4, Math.round(Number(requestedScale || 2))));
  const width = Math.max(1, Math.round(Number(slideSize.widthPt) * scale));
  const height = Math.max(1, Math.round(Number(slideSize.heightPt) * scale));
  const rgba = Buffer.alloc(width * height * 4, 255);
  const target = {
    x: Math.max(0, Math.round(Number(box.x || 0) * scale)),
    y: Math.max(0, Math.round(Number(box.y || 0) * scale)),
    w: Math.max(1, Math.round(Number(box.w || 0) * scale)),
    h: Math.max(1, Math.round(Number(box.h || 0) * scale))
  };
  for (let y = 0; y < target.h && target.y + y < height; y += 1) {
    const sourceY = Math.min(asset.height - 1, Math.floor(y / target.h * asset.height));
    for (let x = 0; x < target.w && target.x + x < width; x += 1) {
      const sourceX = Math.min(asset.width - 1, Math.floor(x / target.w * asset.width));
      const sourceOffset = (sourceY * asset.width + sourceX) * 4;
      const targetOffset = ((target.y + y) * width + target.x + x) * 4;
      rgba[targetOffset] = asset.rgba[sourceOffset];
      rgba[targetOffset + 1] = asset.rgba[sourceOffset + 1];
      rgba[targetOffset + 2] = asset.rgba[sourceOffset + 2];
      rgba[targetOffset + 3] = asset.rgba[sourceOffset + 3];
    }
  }
  return { width, height, rgba };
}

module.exports = {
  auditRealIrBlindLayers,
  chooseCanvasScale,
  imageAssetReference,
  isProtectedMinimumUnit,
  isStronglyProtectedMinimumUnit,
  placeAssetOnSlideCanvas,
  resolveContainedAsset
};
