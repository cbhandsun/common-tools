"use strict";

const { createNativeOnlyStrokeRefiner, proposeNativeOwnedGraphics } = require("./native-only-refinement");
const { fitDeckNativeShapeThinStrokes } = require('./worker-graphic-evidence');
const { allPagesHaveNativeGraphics, nativeShapeThinStrokeMultipliers, proposeNativeUnderlayRemoval, rasterPixel, resolveDeckAssetFile } = require('./worker-job-support');
const { NATIVE_ONLY_RESIDUAL_REJECTION_CODE, RESIDUAL_PRIMITIVE_MAX_SHAPES, RESIDUAL_PRIMITIVE_SCAN_STEP_PX, VISUAL_FALLBACK_REJECTION_CODE, boundedCandidateLimits, brightness, colorDistance, isFiniteBox, isRaster, isSlideSize, rgbToHex, round, saturationProxy } = require('./worker-primitives');
const { safeAssetPath, validateDeckIr } = require("./worker-input-services");
const { componentWorstPriority, finalRefinementQualityAcceptable } = require('./worker-quality-policy');
const { hasMeasuredVisualGain } = require("./candidate-quality-policy");
const { isReplaceablePictorialIconCrop, normalizeKnowledgeGraphNativeZOrder, residualDeduplicationStatus, vectorizeLegacySimpleStatusIconMarks, visualFallbackAnchor } = require('./worker-native-recovery');
const path = require("node:path");
const fs = require("node:fs");
const { auditNativeComponentQuality, nativeObjectMetrics, tileLargeReconstructionRasters, writeTextErasedVisualFallbackAsset } = require("./worker-output-services");
const { visibleVisualFallbackTextBoxes } = require('./worker-text-evidence');
const { orderSourceIconLayers } = require("../slideclone-core/scene-plan/source-icon-layer-order");
const { readPng } = require("./worker-input-services");
const { dominantBlockColor } = require('./worker-primitives-2');
const { vectorizeDensePictorialIcon } = require("../slideclone-core/archetypes/pictorial-icon-native-vectorization");

const refineNativeOnlyStrokes = createNativeOnlyStrokeRefiner({ fit: fitDeckNativeShapeThinStrokes,
  priorityIds: quality => componentWorstPriority(quality, { kind: "shape" }), strokeWidthMultipliers: nativeShapeThinStrokeMultipliers,
  candidateLimits: boundedCandidateLimits, validateDeck: validateDeckIr, qualityAcceptable: finalRefinementQualityAcceptable, hasMeasuredGain: hasMeasuredVisualGain });

function preservedVisualFallbackShapes(page = {}, pageIndex = 0) {
  const shapes = Array.isArray(page.shapes)
    ? page.shapes.filter((shape) => shape && typeof shape === "object")
    : [];
  if (shapes.length > 0) return shapes.map((shape) => ({
    ...shape,
    source: {
      ...(shape.source || {}),
      editable: shape.source?.editable === false ? false : true,
      retainedInVisualFallback: true
    }
  }));
  return [visualFallbackAnchor(pageIndex)];
}

function createTiledVisualFallbackDeck({ baseDeck, sourceImages, root, objectifySolidRegions = false, eraseNativeShapes = false, eraseNativeShapeMode = "all", assetPrefix = "" }) {
  if (!baseDeck?.slideSize || !Array.isArray(baseDeck.pages) || !Array.isArray(sourceImages) || sourceImages.length !== baseDeck.pages.length) throw new Error("visual fallback source deck is invalid");
  const assetsDir = path.join(root, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const deck = {
    ...baseDeck,
    meta: { ...(baseDeck.meta || {}), visualFallback: { strategy: "tiled-source-with-retained-native-visible-text-overlays", pages: baseDeck.pages.length } },
    pages: baseDeck.pages.map((page, pageIndex) => {
      const assetPath = `assets/${assetPrefix}visual-fallback-page-${String(pageIndex + 1).padStart(3, "0")}.png`;
      const textErasure = writeTextErasedVisualFallbackAsset({
        sourceFile: sourceImages[pageIndex],
        outputFile: path.join(root, ...assetPath.split("/")),
        page,
        slideSize: baseDeck.slideSize,
        objectifySolidRegions,
        eraseNativeShapes,
        eraseNativeShapeMode
      });
      const retainedShapes = preservedVisualFallbackShapes(page, pageIndex);
      const primitiveShapes = Array.isArray(textErasure.nativeShapes) ? textErasure.nativeShapes : [];
      return {
        ...page,
        intent: { ...(page.intent || {}), visualFallbackVerified: true, visualFallbackStrategy: "tiled-source-with-retained-native-visible-text-overlays" },
        shapes: [...retainedShapes, ...primitiveShapes],
        icons: [],
        tables: [],
        charts: [],
        textBoxes: visibleVisualFallbackTextBoxes(page),
        images: [{
          id: `visual-fallback-source-${pageIndex + 1}`,
          type: "fidelity-crop",
          assetPath,
          box: { x: 0, y: 0, w: baseDeck.slideSize.widthPt, h: baseDeck.slideSize.heightPt },
          style: { opacity: 1, assetPath },
          source: {
            editable: false,
            nativeRebuild: true,
            detector: "foreground-graphic-crop",
            visualFallbackSource: true,
            strategy: "tiled-text-erased-source-visual-fallback",
            erasedNativeTextBoxes: textErasure.textMasks,
            erasedNativeShapes: textErasure.shapeMasks,
            erasedNativeSolidRegions: textErasure.solidMasks,
            erasedNativeTextPixels: textErasure.erasedPixels,
            nonEditableReason: objectifySolidRegions || eraseNativeShapes
              ? "Source-faithful visual fallback is text/accepted-native-object-erased and tiled below the large-raster threshold while OCR text and accepted native graphics remain visible and editable."
              : "Source-faithful visual fallback is text-erased and tiled below the large-raster threshold while OCR text remains visible and editable."
          }
        }]
      };
    })
  };
  tileLargeReconstructionRasters(deck, { root });
  return deck;
}

function visualFallbackCandidateDiagnostics(rejections) {
  const diagnostics = {};
  for (const rejection of Array.isArray(rejections) ? rejections : []) {
    if (!rejection || typeof rejection !== "object") continue;
    const suffix = typeof rejection.suffix === "string" && /^[a-z0-9-]{1,32}$/u.test(rejection.suffix) ? rejection.suffix : "unknown";
    const code = Number.isSafeInteger(rejection.code) && rejection.code > 0 ? rejection.code : VISUAL_FALLBACK_REJECTION_CODE.unexpected;
    diagnostics[`editable-visible-text-fallback-${suffix}-rejected`] = 1;
    diagnostics[`editable-visible-text-fallback-${suffix}-rejection-code`] = code;
  }
  return diagnostics;
}

function nativeOnlyResidualRejected(code, { removed = 0, nativeResidualPrimitives = 0 } = {}) {
  const rejectionCode = Number.isSafeInteger(code) && code > 0 ? code : NATIVE_ONLY_RESIDUAL_REJECTION_CODE.unexpected;
  return {
    rejected: true,
    rejectionCode,
    removed: Number.isSafeInteger(removed) && removed >= 0 ? removed : 0,
    nativeResidualPrimitives: Number.isSafeInteger(nativeResidualPrimitives) && nativeResidualPrimitives >= 0 ? nativeResidualPrimitives : 0
  };
}

function removeFullSlideResidualImages(deck, { includeSemanticUnderlays = false } = {}) {
  const next = structuredClone(deck || {});
  let removed = 0;
  const slideArea = Number(next?.slideSize?.widthPt) * Number(next?.slideSize?.heightPt);
  if (!Number.isFinite(slideArea) || slideArea <= 0 || !Array.isArray(next.pages)) return { deck: next, removed };
  for (const page of next.pages) {
    vectorizeLegacySimpleStatusIconMarks(page);
    normalizeKnowledgeGraphNativeZOrder(page);
    page.shapes = orderSourceIconLayers(Array.isArray(page.shapes) ? page.shapes : [], next.slideSize).shapes;
    if (!Array.isArray(page?.images)) continue;
    const kept = [];
    for (const image of page.images) {
      const area = Number(image?.box?.w) * Number(image?.box?.h);
      const ratio = Number.isFinite(area) && area > 0 ? Math.min(1, area / slideArea) : 0;
      const source = image?.source || {};
      const legacyFullSlideResidual = source.residualCrop === true
        && ratio >= 0.9
        && (source.nativeObjectsErased === true || source.strategy === "full-slide-object-erased-residual");
      const fullSlideResidual = source.fullSlideResidual === true
        || source.visualFallbackSource === true
        || legacyFullSlideResidual
        || (source.detector === "foreground-graphic-crop" && ratio >= 0.9);
      const primitiveReplacedLargeRaster = source.nativeResidualPrimitiveSource === true
        && (source.detector === "foreground-graphic-crop" || source.strategy === "local-fidelity-crop" || source.residualCrop === true)
        && ratio >= 0.08;
      const semanticUnderlayProposal = includeSemanticUnderlays === true
        && proposeNativeUnderlayRemoval(image, next.slideSize);
      if (fullSlideResidual || primitiveReplacedLargeRaster || semanticUnderlayProposal) {
        removed += 1;
        continue;
      }
      kept.push(image);
    }
    page.images = kept;
  }
  return { deck: next, removed };
}

function addNativeResidualPrimitives(deck, root) {
  const next = structuredClone(deck || {});
  if (typeof root !== "string" || !path.isAbsolute(root) || !Array.isArray(next.pages)) return { deck: next, added: 0, skipped: 0 };
  let added = 0;
  let skipped = 0;
  for (let pageIndex = 0; pageIndex < next.pages.length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    if (!page || typeof page !== "object" || !Array.isArray(page.images)) continue;
    const slideSize = next.slideSize;
    if (!isSlideSize(slideSize)) continue;
    const shapes = [];
    for (const image of page.images) {
      if (!isResidualPrimitiveCandidate(image)) continue;
      const remainingBudget = RESIDUAL_PRIMITIVE_MAX_SHAPES - added - shapes.length;
      if (remainingBudget <= 0) {
        skipped += 1;
        continue;
      }
      const assetFile = resolveDeckAssetFile(root, image.assetPath);
      if (!assetFile) {
        skipped += 1;
        continue;
      }
      let raster;
      try {
        raster = readPng(assetFile);
      } catch {
        skipped += 1;
        continue;
      }
      const primitives = vectorizeResidualRaster(raster, image.box, slideSize, {
        idPrefix: `native-residual-p${pageIndex + 1}-${String(image.id || "image").replace(/[^a-z0-9_-]/giu, "-")}`,
        maxShapes: remainingBudget
      });
      if (primitives.skipped) skipped += 1;
      else if (primitives.shapes.length > 0) {
        image.source = {
          ...(image.source || {}),
          nativeResidualPrimitiveSource: true,
          nativeResidualPrimitiveCount: primitives.shapes.length
        };
      }
      shapes.push(...primitives.shapes);
    }
    if (shapes.length > 0) {
      page.shapes = [...shapes, ...(Array.isArray(page.shapes) ? page.shapes : [])];
      added += shapes.length;
    }
  }
  return { deck: next, added, skipped };
}

function isResidualPrimitiveCandidate(image) {
  if (!image || typeof image !== "object" || !isFiniteBox(image.box)) return false;
  const source = image.source || {};
  return source.fullSlideResidual === true
    || source.visualFallbackSource === true
    || source.residualCrop === true
    || source.detector === "foreground-graphic-crop";
}

function vectorizeResidualRaster(raster, targetBox, slideSize, options = {}) {
  const maxShapes = Number.isSafeInteger(options.maxShapes) && options.maxShapes > 0 ? options.maxShapes : RESIDUAL_PRIMITIVE_MAX_SHAPES;
  const idPrefix = typeof options.idPrefix === "string" && options.idPrefix ? options.idPrefix.slice(0, 80) : "native-residual";
  if (!isRaster(raster) || !isFiniteBox(targetBox) || !isSlideSize(slideSize)) return { shapes: [], skipped: true };
  const background = estimateResidualBackground(raster);
  const step = RESIDUAL_PRIMITIVE_SCAN_STEP_PX;
  const active = new Map();
  const finished = [];
  for (let y = 0; y < raster.height; y += step) {
    const rowRuns = residualForegroundRuns(raster, y, step, background);
    const nextActive = new Map();
    for (const run of rowRuns) {
      const key = `${run.x}:${run.w}:${run.fill}`;
      const previous = active.get(key);
      if (previous && previous.y + previous.h === y) {
        previous.h += step;
        nextActive.set(key, previous);
      } else {
        const box = { x: run.x, y, w: run.w, h: step };
        nextActive.set(key, { ...box, fill: run.fill });
      }
    }
    for (const [key, rect] of active.entries()) {
      if (!nextActive.has(key)) finished.push(rect);
      if (finished.length > maxShapes) return { shapes: [], skipped: true };
    }
    active.clear();
    for (const [key, rect] of nextActive.entries()) active.set(key, rect);
  }
  finished.push(...active.values());
  if (finished.length > maxShapes) return { shapes: [], skipped: true };
  const shapes = finished
    .filter((rect) => rect.w >= step && rect.h >= step)
    .map((rect, index) => residualPrimitiveShape(`${idPrefix}-${index + 1}`, rect, raster, targetBox, slideSize));
  return { shapes, skipped: false };
}

function residualForegroundRuns(raster, y, step, background) {
  const runs = [];
  let active = null;
  for (let x = 0; x < raster.width; x += step) {
    const color = dominantBlockColor(raster, x, y, step);
    const fill = residualForegroundFill(color, background);
    if (!fill) {
      if (active) {
        runs.push(active);
        active = null;
      }
      continue;
    }
    if (active && active.fill === fill && active.x + active.w === x) active.w += step;
    else {
      if (active) runs.push(active);
      active = { x, w: step, fill };
    }
  }
  if (active) runs.push(active);
  return runs.filter((run) => run.w >= step * 2);
}

function residualForegroundFill(color, background) {
  if (!color || color.a < 128) return "";
  const distance = colorDistance(color, background);
  if (distance < 18) return "";
  if (brightness(color) > 248 && saturationProxy(color) < 10) return "";
  return rgbToHex(color);
}

function estimateResidualBackground(raster) {
  const samples = [];
  const margin = Math.max(1, Math.floor(Math.min(raster.width, raster.height) * 0.04));
  for (let y = 0; y < raster.height; y += Math.max(1, Math.floor(raster.height / 24))) {
    for (let x = 0; x < raster.width; x += Math.max(1, Math.floor(raster.width / 24))) {
      if (x > margin && x < raster.width - margin && y > margin && y < raster.height - margin) continue;
      const color = rasterPixel(raster, x, y);
      if (color && color.a >= 128) samples.push(color);
    }
  }
  if (samples.length === 0) return { r: 255, g: 255, b: 255, a: 255 };
  const buckets = new Map();
  for (const color of samples) {
    const key = `${Math.round(color.r / 12)},${Math.round(color.g / 12)},${Math.round(color.b / 12)}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += color.r;
    bucket.g += color.g;
    bucket.b += color.b;
    buckets.set(key, bucket);
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return { r: 255, g: 255, b: 255, a: 255 };
  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
    a: 255
  };
}

function residualPrimitiveShape(id, rect, raster, targetBox, slideSize) {
  const x = targetBox.x + rect.x * targetBox.w / raster.width;
  const y = targetBox.y + rect.y * targetBox.h / raster.height;
  const w = rect.w * targetBox.w / raster.width;
  const h = rect.h * targetBox.h / raster.height;
  return {
    id,
    type: "rect",
    box: {
      x: round(Math.max(0, Math.min(slideSize.widthPt, x))),
      y: round(Math.max(0, Math.min(slideSize.heightPt, y))),
      w: round(Math.max(0.1, Math.min(slideSize.widthPt, x + w) - Math.max(0, x))),
      h: round(Math.max(0.1, Math.min(slideSize.heightPt, y + h) - Math.max(0, y)))
    },
    style: { fill: rect.fill, stroke: rect.fill, strokeWidthPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "native-residual-primitive-rect",
      componentQualityIgnore: true
    }
  };
}

function replacePictorialIconCropsWithNativeShapes(deck, root) {
  if (!deck || typeof deck !== "object" || !Array.isArray(deck.pages) || typeof root !== "string" || !path.isAbsolute(root)) return null;
  const ownership = proposeNativeOwnedGraphics(deck, root);
  if (ownership) return ownership;
  const next = structuredClone(deck);
  let vectorizedImages = 0;
  let nativeShapes = 0;
  for (const page of next.pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.images)) continue;
    const keptImages = [];
    const addedShapes = [];
    for (const image of page.images) {
      if (!isReplaceablePictorialIconCrop(image)) {
        keptImages.push(image);
        continue;
      }
      const assetPath = typeof image.assetPath === "string" ? image.assetPath : "";
      let sourceImage;
      try {
        sourceImage = readPng(path.join(root, ...safeAssetPath(assetPath).split("/")));
      } catch {
        keptImages.push(image);
        continue;
      }
      const shapes = vectorizeDensePictorialIcon({
        image: sourceImage,
        box: image.box,
        idPrefix: `${image.id || "pictorial-icon"}-native`,
        sourceImageId: image.id || null
      });
      if (shapes.length < 1) {
        keptImages.push(image);
        continue;
      }
      vectorizedImages += 1;
      nativeShapes += shapes.length;
      addedShapes.push(...shapes);
    }
    page.images = keptImages;
    page.shapes = [...(Array.isArray(page.shapes) ? page.shapes : []), ...addedShapes];
  }
  return vectorizedImages > 0 ? { deck: next, vectorizedImages, nativeShapes } : null;
}

function adoptNativeOnlyResidualCandidate({ metadata, nativeOnlyCandidate, root }) {
  validateDeckIr(nativeOnlyCandidate.deck, root);
  const retainedErasure = require('./retained-residual-deduplication').retainResidualDeduplication(
    metadata.generatedDeck, nativeOnlyCandidate.deck, metadata.residualDeduplication);
  metadata.generatedDeck = nativeOnlyCandidate.deck;
  metadata.deckFile = nativeOnlyCandidate.deckFile;
  metadata.nativeMetrics = nativeObjectMetrics(nativeOnlyCandidate.deck);
  metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(nativeOnlyCandidate.deck);
  metadata.residualDeduplication = residualDeduplicationStatus(nativeOnlyCandidate.deck, retainedErasure);
  metadata.nativeComponentQuality = auditNativeComponentQuality(nativeOnlyCandidate.deck);
  const validated = validateDeckIr(nativeOnlyCandidate.deck, root);
  metadata.pages = validated.pages;
  metadata.assets = validated.assets;
}

module.exports = { refineNativeOnlyStrokes, preservedVisualFallbackShapes, createTiledVisualFallbackDeck, visualFallbackCandidateDiagnostics, nativeOnlyResidualRejected, removeFullSlideResidualImages, addNativeResidualPrimitives, isResidualPrimitiveCandidate, vectorizeResidualRaster, residualForegroundRuns, residualForegroundFill, estimateResidualBackground, residualPrimitiveShape, replacePictorialIconCropsWithNativeShapes, adoptNativeOnlyResidualCandidate };
