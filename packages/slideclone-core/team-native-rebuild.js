"use strict";
const { attemptSourceResidual, finalizeWithApprovedFrames, withApprovedBackdropBudget,finalizeNativeRouteRepresentations,commitNativeRouteMaterialization,parseNativeOutputPolicy,selectNativeOutputImages,groupSemanticNodes } = require("./native-rebuild-residual-stage");
const { assertUnverifiedRegionTextPreserved } = require("./native-rebuild-residual-stage");
const { canErasePreservedInteriorPath } = require("./native-rebuild-residual-stage");

const fs = require("node:fs");
const { createNativeRebuildCandidatePolicy } = require("./quality/native-rebuild-candidate-policy");
const { qualityRendered, visualQualityDoesNotRegress, rasterEditabilityDoesNotRegress, selectNativeRebuildCandidate, selectOcrRecovery, assessOcrRecovery, shouldStopOcrRecoverySearch } = createNativeRebuildCandidatePolicy({largeRasterEditability,nativeObjectMetrics});
const path = require("node:path");
const { detectSolidVisualFallbackRectangles } = require("./scene-plan/solid-region-evidence");
const { cropPng, readPng, writePng } = require("./png");
const { averageColor, colorDistance, maskBounds, pixel, pointInMask, pxToPtBox, rgbToHex, sampleMaskBackgroundColor } = require("./scene-plan/raster-native-detection");
const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild } = require("./native-rebuild-scene-stage");
const { auditNativeComponentQuality } = require("./quality/native-component-quality");
const { PRODUCTION_PROFILE_NAME, createProductionNativeRebuildOptions } = require("./native-rebuild-profile");
const { compactTeamComponentEvidence } = require("./archetypes/team-component-evidence");
const { createDeclarativePipeline } = require("./native-rebuild-scene-stage");
const { applySemanticFallbackPipeline } = require("./native-rebuild-scene-stage");
const { semanticFallbackToPageContext } = require("./native-rebuild-scene-stage");
const { recoverMissingOcrText } = require("./native-rebuild-ocr-stage");
const { fitHighConfidenceSingleLineOcrToEvidence } = require("./native-rebuild-ocr-stage");
const { dropLineTextCoveredForegroundCrops, shouldDropLineTextCoveredForegroundCrop } = require("./native-rebuild-ocr-stage");
const { createLineTextNativeComponentObjects } = require("./native-rebuild-ocr-stage");
const { refineSourceNativeEdges, reassignSourceNativeEdgeOwners } = require("./native-rebuild-residual-stage");
const { refineGrayBorderResiduals } = require("./native-rebuild-residual-stage");
const { replaceResidualCropsWithNativeComponents } = require("./native-rebuild-residual-stage");
const { runSemanticRebuildTransaction } = require("./native-rebuild-scene-stage");
const { finalizeSourceNativePage,ungroupSourceNativeOverlays } = require("./native-rebuild-residual-stage");
const {mapReviewedSceneGraphics,withReviewedGraphicEvidence,captureSourceCropRegistrations,sealSceneInventoryRevisionDeck,sealSceneGlyphRecoveryDeck}=require("./native-rebuild-scene-stage");

const { boundedOcrSourceDeck, correctContextualOcrLines, expandPositionedMixedColorTextSegments } = require("./native-rebuild-ocr-stage");
const { admitOcrResult } = require("./native-rebuild-ocr-stage");
const { applySourceWordLayouts, createSourceWordLayoutSession } = require("./native-rebuild-ocr-stage");

function nativeObjectMetrics(deck) {
  const totals = { shapes: 0, connectors: 0, textBoxes: 0, tables: 0, charts: 0, icons: 0, images: 0 };
  for (const page of Array.isArray(deck?.pages) ? deck.pages : []) {
    for (const key of ["shapes", "textBoxes", "tables", "charts", "icons", "images"]) totals[key] += Array.isArray(page?.[key]) ? page[key].length : 0;
    totals.connectors += (Array.isArray(page?.shapes) ? page.shapes : []).filter((shape) => shape?.type === "line" || shape?.type === "connector" || (shape?.type === "arc" && (shape?.style?.endArrow || shape?.style?.startArrow)) || shape?.source?.connector === true).length;
  }
  return Object.freeze({ ...totals, graphicalObjects: totals.shapes + totals.tables + totals.charts + totals.icons });
}

function largeRasterEditability(deck) {
  let largestAreaRatio = 0;
  let largeRasterCount = 0;
  const tiledGroups = new Map();
  for (const page of deck?.pages || []) {
    const pageArea = Number(deck?.slideSize?.widthPt) * Number(deck?.slideSize?.heightPt);
    if (!Number.isFinite(pageArea) || pageArea <= 0) continue;
    for (const image of page?.images || []) {
      const area = Number(image?.box?.w) * Number(image?.box?.h);
      if (!Number.isFinite(area) || area <= 0) continue;
      const ratio = Math.min(1, area / pageArea);
      largestAreaRatio = Math.max(largestAreaRatio, ratio);
      if (!isReconstructionRaster(image.source)) continue;
      if (image.source?.tiledLargeRaster === true) {
        const key = `${image.source.parentLargeRasterId || image.id || "large-raster"}:${image.source.pageImage || ""}`;
        tiledGroups.set(key, (tiledGroups.get(key) || 0) + ratio);
        continue;
      }
      if (ratio >= MAX_RECONSTRUCTION_CROP_AREA_RATIO) largeRasterCount += 1;
    }
  }
  for (const ratio of tiledGroups.values()) {
    largestAreaRatio = Math.max(largestAreaRatio, Math.min(1, ratio));
    if (ratio >= MAX_RECONSTRUCTION_CROP_AREA_RATIO) largeRasterCount += 1;
  }
  return Object.freeze({ passed: largeRasterCount === 0, largeRasterCount, largestAreaRatio });
}

const MAX_RECONSTRUCTION_CROP_AREA_RATIO = 0.08;
const TARGET_RECONSTRUCTION_TILE_AREA_RATIO = 0.075;

function isReconstructionRaster(source = {}) {
  return source.fullSlideResidual === true || source.residualCrop === true || source.detector === "foreground-graphic-crop" || source.strategy === "local-fidelity-crop";
}

function tileLargeReconstructionRasters(deck, { root, maxAreaRatio = TARGET_RECONSTRUCTION_TILE_AREA_RATIO } = {}) {
  if (!deck || typeof deck !== "object" || !Array.isArray(deck.pages)) return { tiledImages: 0, createdTiles: 0 };
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("large raster tiling root must be an absolute path");
  const slideArea = Number(deck.slideSize?.widthPt) * Number(deck.slideSize?.heightPt);
  if (!Number.isFinite(slideArea) || slideArea <= 0) return { tiledImages: 0, createdTiles: 0 };
  if (!Number.isFinite(maxAreaRatio) || maxAreaRatio <= 0 || maxAreaRatio >= MAX_RECONSTRUCTION_CROP_AREA_RATIO) {
    throw new RangeError("large raster tile area ratio must be positive and below the editability threshold");
  }
  let tiledImages = 0;
  let createdTiles = 0;
  const cache = new Map();
  for (const page of deck.pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.images)) continue;
    const nextImages = [];
    for (const image of page.images) {
      const ratio = imageAreaRatio(image, slideArea);
      if (!isReconstructionRaster(image?.source) || ratio < MAX_RECONSTRUCTION_CROP_AREA_RATIO) {
        nextImages.push(image);
        continue;
      }
      const assetPath = safeAssetPath(image.assetPath);
      if (!assetPath || !validBox(image.box)) {
        nextImages.push(image);
        continue;
      }
      const file = path.resolve(root, ...assetPath.split("/"));
      if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error("large raster tile asset path escapes the work root");
      const sourceImage = cache.get(file) || readPng(file);
      cache.set(file, sourceImage);
      const grid = rasterTileGrid(image.box, slideArea, maxAreaRatio);
      const tileCount = grid.cols * grid.rows;
      for (let row = 0; row < grid.rows; row += 1) {
        for (let col = 0; col < grid.cols; col += 1) {
          const index = row * grid.cols + col;
          const px0 = Math.max(0, Math.round(col * sourceImage.width / grid.cols) - (col > 0 ? 1 : 0));
          const px1 = Math.min(sourceImage.width, Math.round((col + 1) * sourceImage.width / grid.cols) + (col + 1 < grid.cols ? 1 : 0));
          const py0 = Math.max(0, Math.round(row * sourceImage.height / grid.rows) - (row > 0 ? 1 : 0));
          const py1 = Math.min(sourceImage.height, Math.round((row + 1) * sourceImage.height / grid.rows) + (row + 1 < grid.rows ? 1 : 0));
          if (px1 <= px0 || py1 <= py0) continue;
          const tileAssetPath = tilePath(assetPath, row, col);
          const tileFile = path.resolve(root, ...tileAssetPath.split("/"));
          writePng(tileFile, cropPng(sourceImage, { x: px0, y: py0, w: px1 - px0, h: py1 - py0 }));
          const tileBox = {
            x: image.box.x + image.box.w * px0 / sourceImage.width,
            y: image.box.y + image.box.h * py0 / sourceImage.height,
            w: image.box.w * (px1 - px0) / sourceImage.width,
            h: image.box.h * (py1 - py0) / sourceImage.height
          };
          nextImages.push({
            ...image,
            id: `${image.id || "large-raster"}-tile-${row + 1}-${col + 1}`,
            assetPath: tileAssetPath,
            box: tileBox,
            style: { ...(image.style || {}), assetPath: tileAssetPath },
            source: {
              ...compactLargeRasterTileSource(image.source || {}),
              tiledLargeRaster: true,
              parentLargeRasterId: image.id || null,
              tileIndex: index,
              tileCount,
              largeRasterTileAreaRatio: imageAreaRatio({ box: tileBox }, slideArea)
            }
          });
          createdTiles += 1;
        }
      }
      tiledImages += 1;
    }
    page.images = nextImages;
  }
  deck.meta = { ...(deck.meta || {}), largeRasterTiling: { tiledImages, createdTiles, maxAreaRatio } };
  return { tiledImages, createdTiles };
}

function compactLargeRasterTileSource(source) {
  const keep = [
    "editable", "nativeRebuild", "residualCrop", "fullSlideResidual", "textObjectified", "nativeObjectsErased",
    "componentRenderStrategy", "strategy", "detector", "reason", "protectedMinimumUnit", "cropEvidenceRequired",
    "coordinateReferenceSizePx", "mappedPixelBox", "originalPixelBox", "removedNeighborPixels",
    "retainedDetailComponents", "tightenedPixelBox",
    "expressionForm", "expressionSubtype", "recommendedAction", "nonEditableReason", "intentionalMinimumUnitCrop",
    "minimumUnitPolicy", "minimumUnitReason", "pageImage", "erasedNativeTextBoxes", "erasedNativeShapes",
    "erasedNativeSolidRegions", "erasedNativeTextPixels"
  ];
  const compact = {};
  for (const key of keep) {
    if (source[key] !== undefined) compact[key] = source[key];
  }
  return compact;
}

function safeAssetPath(value) {
  return typeof value === "string" && value.startsWith("assets/") && !value.includes("..") && !value.includes("\\") && !value.includes("\0")
    ? value
    : null;
}

function validBox(box) {
  return box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}

function imageAreaRatio(image, slideArea) {
  const area = Number(image?.box?.w) * Number(image?.box?.h);
  return Number.isFinite(area) && area > 0 && Number.isFinite(slideArea) && slideArea > 0 ? Math.min(1, area / slideArea) : 0;
}

function rasterTileGrid(box, slideArea, maxAreaRatio) {
  const ratio = imageAreaRatio({ box }, slideArea);
  const tiles = Math.max(1, Math.ceil(ratio / maxAreaRatio));
  const aspect = Math.max(0.1, Number(box.w) / Math.max(1, Number(box.h)));
  let cols = Math.max(1, Math.ceil(Math.sqrt(tiles * aspect)));
  let rows = Math.max(1, Math.ceil(tiles / cols));
  while ((Number(box.w) / cols) * (Number(box.h) / rows) / slideArea >= MAX_RECONSTRUCTION_CROP_AREA_RATIO) {
    if ((Number(box.w) / cols) > (Number(box.h) / rows)) cols += 1;
    else rows += 1;
  }
  return { cols, rows };
}

function tilePath(assetPath, row, col) {
  const parsed = path.posix.parse(assetPath);
  return path.posix.join(parsed.dir, `${parsed.name}-tile-${String(row + 1).padStart(2, "0")}-${String(col + 1).padStart(2, "0")}${parsed.ext}`);
}

function textBoxPixelMask(textBox, image, slideSize) {
  const box = textBox?.box;
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return null;
  const scaleX = image.width / slideSize.widthPt;
  const scaleY = image.height / slideSize.heightPt;
  const paddingX = Math.max(1, Math.round(scaleX * 0.8));
  const paddingY = Math.max(1, Math.round(scaleY * 0.7));
  const left = Math.max(0, Math.floor(box.x * scaleX) - paddingX);
  const top = Math.max(0, Math.floor(box.y * scaleY) - paddingY);
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX) + paddingX);
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY) + paddingY);
  return right > left && bottom > top ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

function shapePixelMask(shape, image, slideSize) {
  const box = shape?.box;
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  const scaleX = image.width / slideSize.widthPt;
  const scaleY = image.height / slideSize.heightPt;
  const strokeWidthPt = Math.max(1, Number(shape?.style?.strokeWidthPt || shape?.strokeWidthPt || 1));
  if (shape.type === "line" || shape.type === "connector" || shape?.style?.connectorType) {
    return {
      kind: "line",
      x1: Math.max(0, Math.min(image.width - 1, Math.round(box.x * scaleX))),
      y1: Math.max(0, Math.min(image.height - 1, Math.round(box.y * scaleY))),
      x2: Math.max(0, Math.min(image.width - 1, Math.round((box.x + box.w) * scaleX))),
      y2: Math.max(0, Math.min(image.height - 1, Math.round((box.y + box.h) * scaleY))),
      width: Math.max(2, Math.round(strokeWidthPt * (scaleX + scaleY) / 2) + 2),
      eraseMode: "shape"
    };
  }
  if (box.w <= 0 || box.h <= 0) return null;
  const paddingX = Math.max(1, Math.round(scaleX * 1.2));
  const paddingY = Math.max(1, Math.round(scaleY * 1.2));
  const left = Math.max(0, Math.floor(box.x * scaleX) - paddingX);
  const top = Math.max(0, Math.floor(box.y * scaleY) - paddingY);
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX) + paddingX);
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY) + paddingY);
  return right > left && bottom > top ? { x: left, y: top, w: right - left, h: bottom - top, eraseMode: "shape" } : null;
}

function eraseTextPixelsInMasks(source, masks) {
  const next = { width: source.width, height: source.height, rgba: Buffer.from(source.rgba) };
  let erasedPixels = 0;
  for (const mask of masks) {
    const fill = sampleMaskBackgroundColor(source, mask);
    const bounds = maskBounds(mask, source);
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
        if (!pointInMask(x, y, mask)) continue;
        const offset = (y * source.width + x) * 4;
        const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2], a: source.rgba[offset + 3] };
        if (color.a < 32 || (mask.eraseMode !== "shape" && colorDistance(color, fill) < 30)) continue;
        next.rgba[offset] = fill.r;
        next.rgba[offset + 1] = fill.g;
        next.rgba[offset + 2] = fill.b;
        next.rgba[offset + 3] = 255;
        erasedPixels += 1;
      }
    }
  }
  return { image: next, erasedPixels };
}

function isVisualFallbackShapeEraseCandidate(shape, mode = "all") {
  const detector = String(shape?.source?.detector || "");
  if (mode === "lines") {
    return detector === "long-axis-line" || detector === "line-text-native-grid-rule";
  }
  return detector === "long-axis-line" || detector.startsWith("line-text-native-");
}

function writeTextErasedVisualFallbackAsset({ sourceFile, outputFile, page, slideSize, objectifySolidRegions = false, eraseNativeShapes = false, eraseNativeShapeMode = "all" }) {
  const source = readPng(sourceFile);
  const textMasks = (Array.isArray(page?.textBoxes) ? page.textBoxes : [])
    .map((textBox) => textBoxPixelMask(textBox, source, slideSize))
    .filter(Boolean)
    .slice(0, 1000);
  const shapeMasks = eraseNativeShapes ? (Array.isArray(page?.shapes) ? page.shapes : [])
    .filter((shape) => isVisualFallbackShapeEraseCandidate(shape, eraseNativeShapeMode))
    .map((shape) => shapePixelMask(shape, source, slideSize))
    .filter(Boolean)
    .slice(0, 500) : [];
  const nativeShapes = objectifySolidRegions ? detectSolidVisualFallbackRectangles(source, slideSize, Array.isArray(page?.shapes) ? page.shapes.length : 0) : [];
  const solidMasks = nativeShapes
    .map((shape) => shapePixelMask(shape, source, slideSize))
    .filter(Boolean);
  const masks = [...textMasks, ...shapeMasks, ...solidMasks];
  const erased = masks.length > 0 ? eraseTextPixelsInMasks(source, masks) : { image: source, erasedPixels: 0 };
  writePng(outputFile, erased.image);
  return {
    masks: masks.length,
    textMasks: textMasks.length,
    shapeMasks: shapeMasks.length,
    solidMasks: solidMasks.length,
    erasedPixels: erased.erasedPixels,
    nativeShapes
  };
}

function addSolidRegionNativeBackgrounds(page = {}, slideSize = {}, sourceFile) {
  if (!page || typeof page !== "object" || typeof sourceFile !== "string" || !fs.existsSync(sourceFile)) return 0;
  if (!Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return 0;
  const source = readPng(sourceFile);
  const existingShapeCount = Array.isArray(page.shapes) ? page.shapes.length : 0;
  const existingShapes = Array.isArray(page.shapes) ? page.shapes : [];
  const regions = detectSolidVisualFallbackRectangles(source, slideSize, existingShapeCount)
    .filter((shape) => shape.box.w >= 36 && shape.box.h >= 20)
    .filter((shape) => !shouldSuppressSolidRegionDueToLineTextPanel(shape, existingShapes))
    .map((shape, index) => ({
      ...shape,
      id: `solid-region-native-background-${existingShapeCount + index + 1}`,
      source: {
        ...(shape.source || {}),
        detector: "solid-region-native-background",
          componentQualityIgnore: true,
        semanticNativeStructure: true,
        preserveResidualInterior: true,
        residualBackgroundFill: true
      }
    }));
  if (regions.length === 0) return 0;
  page.shapes = [...regions, ...(Array.isArray(page.shapes) ? page.shapes : [])];
  return regions.length;
}

function addLowContrastFooterNativeMarks(page = {}, slideSize = {}, sourceFile) {
  if (!page || typeof page !== "object" || typeof sourceFile !== "string" || !fs.existsSync(sourceFile)) return 0;
  if (!Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return 0;
  const source = readPng(sourceFile);
  const marks = detectLowContrastFooterMarks(source, slideSize, page);
  if (marks.length === 0) return 0;
  const backgrounds = [];
  const rest = [];
  for (const shape of Array.isArray(page.shapes) ? page.shapes : []) {
    if (shape?.source?.detector === "solid-region-native-background") backgrounds.push(shape);
    else rest.push(shape);
  }
  page.shapes = [...backgrounds, ...marks, ...rest];
  return marks.length;
}

function detectLowContrastFooterMarks(source, slideSize, page = {}) {
  const step = 6;
  const gridW = Math.ceil(source.width / step);
  const gridH = Math.ceil(source.height / step);
  const minY = Math.floor(gridH * 0.92);
  const visited = new Uint8Array(gridW * gridH);
  const textMasks = (Array.isArray(page.textBoxes) ? page.textBoxes : [])
    .map((textBox) => textBoxPixelMask(textBox, source, slideSize))
    .filter(Boolean);
  const components = [];
  const existingShapeCount = Array.isArray(page.shapes) ? page.shapes.length : 0;
  for (let gy = minY; gy < gridH; gy += 1) {
    for (let gx = 0; gx < gridW; gx += 1) {
      const start = gy * gridW + gx;
      if (visited[start]) continue;
      const sx = Math.min(source.width - 1, gx * step + Math.floor(step / 2));
      const sy = Math.min(source.height - 1, gy * step + Math.floor(step / 2));
      const seed = pixel(source, sx, sy);
      if (!isLowContrastFooterMarkSeed(seed) || pointInAnyMask(sx, sy, textMasks)) {
        visited[start] = 1;
        continue;
      }
      const queue = [[gx, gy]];
      const colors = [];
      visited[start] = 1;
      let qi = 0;
      let count = 0;
      let minGX = gx;
      let maxGX = gx;
      let minGY = gy;
      let maxGY = gy;
      while (qi < queue.length && count < 900) {
        const [cx, cy] = queue[qi++];
        const px = Math.min(source.width - 1, cx * step + Math.floor(step / 2));
        const py = Math.min(source.height - 1, cy * step + Math.floor(step / 2));
        const color = pixel(source, px, py);
        if (colors.length < 250) colors.push(color);
        count += 1;
        minGX = Math.min(minGX, cx);
        maxGX = Math.max(maxGX, cx);
        minGY = Math.min(minGY, cy);
        maxGY = Math.max(maxGY, cy);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < minY || nx >= gridW || ny >= gridH) continue;
          const nextIndex = ny * gridW + nx;
          if (visited[nextIndex]) continue;
          const nextX = Math.min(source.width - 1, nx * step + Math.floor(step / 2));
          const nextY = Math.min(source.height - 1, ny * step + Math.floor(step / 2));
          const next = pixel(source, nextX, nextY);
          if (!isLowContrastFooterMarkSeed(next) || pointInAnyMask(nextX, nextY, textMasks) || colorDistance(seed, next) > 34) {
            visited[nextIndex] = 1;
            continue;
          }
          visited[nextIndex] = 1;
          queue.push([nx, ny]);
        }
      }
      if (count < 2) continue;
      const coarseBox = {
        x: minGX * step,
        y: minGY * step,
        w: Math.min(source.width, (maxGX + 1) * step) - minGX * step,
        h: Math.min(source.height, (maxGY + 1) * step) - minGY * step
      };
      const refined = refineLowContrastFooterMark(source, coarseBox, seed, textMasks);
      const box = refined?.box || coarseBox;
      if (refined && refined.density < 0.62) continue;
      const markColors = refined?.colors?.length ? refined.colors : colors;
      const area = box.w * box.h;
      if (area < 36 || area > source.width * source.height * 0.018) continue;
      const ptBox = pxToPtBox(box, source, slideSize, 0);
      if (ptBox.w < 2 || ptBox.h < 2 || ptBox.w > slideSize.widthPt * 0.28 || ptBox.h > slideSize.heightPt * 0.055) continue;
      if (ptBox.w * ptBox.h < 160) continue;
      components.push({
        id: `low-contrast-footer-native-mark-${existingShapeCount + components.length + 1}`,
        type: roundedMarkType(ptBox),
        box: ptBox,
        style: {
          fill: rgbToHex(averageColor(markColors)),
          stroke: "none",
          strokeWidthPt: 0,
          opacity: 1,
          ...(roundedMarkType(ptBox) === "roundRect" ? { radiusPt: Math.min(ptBox.h / 2, 4) } : {})
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "low-contrast-footer-native-mark",
          semanticNativeStructure: true,
          pageImage: "assets/page-001/source.png"
        }
      });
    }
  }
  return components
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))
    .slice(0, 160);
}

function refineLowContrastFooterMark(source, coarseBox, seed, textMasks) {
  const margin = 8;
  const left = Math.max(0, coarseBox.x - margin);
  const top = Math.max(0, coarseBox.y - margin);
  const right = Math.min(source.width, coarseBox.x + coarseBox.w + margin);
  const bottom = Math.min(source.height, coarseBox.y + coarseBox.h + margin);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const colors = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const current = pixel(source, x, y);
      if (!isLowContrastFooterMarkSeed(current) || pointInAnyMask(x, y, textMasks) || colorDistance(seed, current) > 34) continue;
      x1 = Math.min(x1, x);
      y1 = Math.min(y1, y);
      x2 = Math.max(x2, x + 1);
      y2 = Math.max(y2, y + 1);
      if (colors.length < 500) colors.push(current);
    }
  }
  if (!Number.isFinite(x1) || colors.length < 8) return null;
  const box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  return { box, colors, density: colors.length / Math.max(1, box.w * box.h) };
}

function roundedMarkType(box = {}) {
  const ratio = Number(box.w) / Math.max(1, Number(box.h));
  return ratio >= 0.65 && ratio <= 1.55 ? "ellipse" : "roundRect";
}

function pointInAnyMask(x, y, masks = []) {
  return masks.some((mask) => pointInMask(mask, x, y));
}

function isLowContrastFooterMarkSeed(color) {
  if (!color || color.a < 64) return false;
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const brightness = (color.r + color.g + color.b) / 3;
  return brightness >= 118 && brightness <= 225 && max - min <= 30;
}

function shouldSuppressSolidRegionDueToLineTextPanel(region = {}, shapes = []) {
  if (!isFiniteBox(region?.box) || !Array.isArray(shapes)) return false;
  const regionArea = region.box.w * region.box.h;
  if (!Number.isFinite(regionArea) || regionArea <= 0) return false;
  return shapes.some((shape) => {
    const detector = String(shape?.source?.detector || "");
    if (!isFiniteBox(shape?.box)) return false;
    if (!/^line-text-native-(?:numbered-section-panel|numbered-band-panel|section-panel|title-band-panel|group-panel)$/u.test(detector)) return false;
    const overlap = intersectionArea(region.box, shape.box);
    if (overlap / regionArea < 0.88) return false;
    const shapeArea = shape.box.w * shape.box.h;
    return shapeArea >= regionArea * 1.15;
  });
}

function dropSolidRegionsCoveredByLineTextPanels(page = {}) {
  if (!Array.isArray(page.shapes)) return 0;
  const before = page.shapes.length;
  const lineTextPanels = page.shapes.filter((shape) => {
    const detector = String(shape?.source?.detector || "");
    return detector.startsWith("line-text-native-") && detector.includes("panel");
  });
  if (lineTextPanels.length === 0) return 0;
  page.shapes = page.shapes.filter((shape) => {
    if (shape?.source?.detector !== "solid-region-native-background") return true;
    return !shouldSuppressSolidRegionDueToLineTextPanel(shape, lineTextPanels);
  });
  return before - page.shapes.length;
}

function mayRecoverOcrCropText(rebuilt) {
  if ((rebuilt?.ocrCropRecovery?.sourceLines || 0) < 5) return false;
  const slideArea = Number(rebuilt?.deck?.slideSize?.widthPt) * Number(rebuilt?.deck?.slideSize?.heightPt);
  if (!Number.isFinite(slideArea) || slideArea <= 0) return false;
  return rebuilt.deck.pages.some((page) => page.images?.some((image) => image?.source?.detector === "foreground-graphic-crop"
    && Number(image.box?.w) * Number(image.box?.h) / slideArea >= 0.08));
}

function ocrRecoveryCandidateScopes(rebuilt) {
  if (!mayRecoverOcrCropText(rebuilt)) return [];
  const slideArea = rebuilt.deck.slideSize.widthPt * rebuilt.deck.slideSize.heightPt;
  const crops = rebuilt.deck.pages.flatMap((page, pageIndex) => (page.images || [])
    .filter((image) => image?.source?.detector === "foreground-graphic-crop"
      && Number(image.box?.w) * Number(image.box?.h) / slideArea >= 0.08)
    .map((image) => ({ pageIndex, cropId: image.id, area: image.box.w * image.box.h })));
  crops.sort((left, right) => right.area - left.area);
  return [null, ...crops.slice(0, 2).map(({ pageIndex, cropId }) => ({ pageIndex, cropId }))];
}

function copyDirectoryFiles(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error("native image rebuild produced an invalid asset tree");
    fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
  }
}

function applySourceNativeEdgeRefinement({ generatedDeck, sourceFile, refineNativeEdges }) {
  const page = generatedDeck?.pages?.[0];
  const slideSize = generatedDeck?.slideSize;
  if (!page || !slideSize || typeof refineNativeEdges !== "function") return;
  const result = refineNativeEdges({ page, slideSize, image: readPng(sourceFile), enableSourceNodeConnectors: true });
  if (!result || !result.page || !result.evidence) return;
  generatedDeck.pages[0] = result.page;
  const previous = generatedDeck.meta?.sourceNativeEdgeRefinement;
  generatedDeck.meta = {
    ...(generatedDeck.meta || {}),
    sourceNativeEdgeRefinement: mergeSourceNativeEdgeEvidence(previous, result.evidence)
  };
}

function mergeSourceNativeEdgeEvidence(previous, next) {
  const merged = {};
  for (const key of ["candidates", "rectsRefined", "partialSideLines", "panelsWithoutStroke", "linesRefined", "ownerReassigned", "samples"]) {
    const left = Number(previous?.[key] || 0);
    const right = Number(next?.[key] || 0);
    const total = (Number.isFinite(left) ? left : 0) + (Number.isFinite(right) ? right : 0);
    merged[key] = key === "samples" ? Math.min(100000, total) : total;
  }
  return merged;
}

function normalizeSourceAssetProvenance(deck, assetPath) {
  if (typeof assetPath !== "string" || !assetPath.startsWith("assets/") || assetPath.includes("..") || assetPath.includes("\\") || assetPath.includes("\0")) throw new TypeError("native image source asset path is invalid");
  for (const page of Array.isArray(deck?.pages) ? deck.pages : []) {
    page.sourceImage = assetPath;
    for (const collection of ["shapes", "textBoxes", "images", "tables", "charts", "icons"]) {
      for (const item of Array.isArray(page?.[collection]) ? page[collection] : []) {
        if (item?.source && typeof item.source === "object") item.source.pageImage = assetPath;
      }
    }
  }
  return deck;
}

function ungroupHybridOverlayObjects(page,receipt,openOwnerReceipt) { ungroupSourceNativeOverlays(page,receipt,openOwnerReceipt); }

function residualEraseObjects(page, options = {}) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("native image residual page is invalid");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("native image residual options are invalid");
  const objects = [];
  const seen = new Set();
  for (const [collection, requireEditable] of [["textBoxes", false], ["shapes", true], ["tables", true], ["charts", true], ["icons", true]]) {
    for (const item of Array.isArray(page[collection]) ? page[collection] : []) {
      if (!item || typeof item !== "object" || Array.isArray(item) || (item.source?.preserveResidualInterior === true && item.source?.residualBackgroundFill !== true && !canErasePreservedInteriorPath(item)) || (requireEditable && item.source?.editable === false)) continue;
      const envelope = collection === "textBoxes" ? require("./ocr/ocr-text-quadrilateral").rotatedTextEnvelope(item) : null;
      const box = envelope || item.box;
      if (!box || !["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]))) throw new Error("native image residual object is invalid");
      // Freeform bounds do not identify their paint: a body, hollow outline
      // and measured detail can share the same box but own different pixels.
      // Keep each path's erasure; only the same object reference is redundant.
      const key = item.type === "freeform" ? item : [item.type || collection, box.x, box.y, box.w, box.h].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      objects.push(envelope ? { ...item, box, rotation: 0 } : item);
    }
  }
  if (options.includeLocalFidelityImages === true) {
    for (const item of Array.isArray(page.images) ? page.images : []) {
      if (!item || typeof item !== "object" || Array.isArray(item) || item.source?.fullSlideResidual === true) continue;
      const box = item.box;
      if (!box || !["x", "y", "w", "h"].every((key) => Number.isFinite(box[key])) || box.w <= 0 || box.h <= 0) {
        throw new Error("native image local fidelity object is invalid");
      }
      const key = ["image", box.x, box.y, box.w, box.h].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      objects.push(item);
    }
  }
  return objects;
}

function shouldOmitFullSlideResidual(semanticNative) {
  return semanticNative?.matched === true && semanticNative.imageRefinement?.matched === true && semanticNative.pictorialConnectors?.matched === true && !(semanticNative.shapeAdmission?.rejected > 0);
}

function shouldOmitFullSlideResidualAfterOcrRecovery(page = {}, slideSize = {}, ocrCropRecovery = {}) {
  const pageArea = Number(slideSize.widthPt || 0) * Number(slideSize.heightPt || 0);
  if (!Number.isFinite(pageArea) || pageArea <= 0) return false;
  if (Number(ocrCropRecovery.recovered || 0) < 5 || Number(ocrCropRecovery.cropsErased || 0) < 1) return false;
  const localImages = Array.isArray(page.images)
    ? page.images.filter((image) => image?.source?.fullSlideResidual !== true && image?.box)
    : [];
  if (localImages.length === 0) return false;
  const areas = localImages.map((image) => Number(image.box.w || 0) * Number(image.box.h || 0) / pageArea)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (areas.length === 0) return false;
  const total = areas.reduce((sum, value) => sum + value, 0);
  const largest = Math.max(...areas);
  return total <= 0.45 && largest <= 0.4;
}

function addRecoveredLineTextNativeComponents(page = {}, slideSize = {}, sourceFile = "") {
  if (!Array.isArray(page.shapes) || !Array.isArray(page.textBoxes) || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return 0;
  const lines = page.shapes.filter((shape) => shape?.source?.detector === "long-axis-line");
  const structureTextBoxes = lineTextStructureTextBoxes(page.textBoxes);
  if (lines.length < 2 || !structureTextBoxes.some((textBox) => textBox?.source?.ocrRecoveredFromCrop === true)) return 0;
  let image;
  try {
    image = sourceFile ? readPng(sourceFile) : null;
  } catch {
    image = null;
  }
  const components = createLineTextNativeComponentObjects({ lines, textBoxes: structureTextBoxes, slideSize, image });
  const additions = components.shapes
    .filter((shape) => !page.shapes.some((existing) => sameNativeShape(existing, shape)));
  const textAdditions = components.textBoxes
    .filter((textBox) => !page.textBoxes.some((existing) => sameNativeTextBox(existing, textBox)));
  const backgroundAdditions = additions.filter(isRecoveredLineTextBackgroundShape);
  const foregroundAdditions = additions.filter((shape) => !isRecoveredLineTextBackgroundShape(shape));
  page.shapes = [...backgroundAdditions, ...page.shapes, ...foregroundAdditions];
  if (textAdditions.length > 0) page.textBoxes = [...page.textBoxes, ...textAdditions];
  return additions.length + textAdditions.length;
}

function addFinalTextGroupNativeComponents(page = {}, slideSize = {}, sourceFile = "") {
  if (!Array.isArray(page.shapes) || !Array.isArray(page.textBoxes) || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return 0;
  const lines = page.shapes.filter((shape) => shape?.source?.detector === "long-axis-line");
  const structureTextBoxes = lineTextStructureTextBoxes(page.textBoxes);
  if (lines.length < 2 || structureTextBoxes.length < 8) return 0;
  let image;
  try {
    image = sourceFile ? readPng(sourceFile) : null;
  } catch {
    image = null;
  }
  const additions = createLineTextNativeComponentObjects({ lines, textBoxes: structureTextBoxes, slideSize, image }).shapes
    .filter((shape) => shape?.source?.detector === "line-text-native-group-panel")
    .filter((shape) => !page.shapes.some((existing) => sameNativeShape(existing, shape)));
  if (additions.length === 0) return 0;
  page.shapes = [...additions, ...page.shapes];
  return additions.length;
}

function lineTextStructureTextBoxes(textBoxes = []) {
  if (!Array.isArray(textBoxes)) return [];
  return textBoxes.filter((textBox) => textBox?.source?.segmentedOcrLineId === undefined);
}

function addSourceOcrLineTextNativeComponents(page = {}, slideSize = {}, sourceFile = "", sourceTextBoxes = []) {
  if (!Array.isArray(page.shapes) || !Array.isArray(page.textBoxes) || !Array.isArray(page.images) || !Array.isArray(sourceTextBoxes)
    || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) return 0;
  const lines = page.shapes.filter((shape) => shape?.source?.detector === "long-axis-line");
  if (lines.length < 2) return 0;
  const slideArea = slideSize.widthPt * slideSize.heightPt;
  if (!Number.isFinite(slideArea) || slideArea <= 0) return 0;
  const cropBoxes = page.images
    .filter((image) => image?.source?.detector === "foreground-graphic-crop" && isFiniteBox(image.box))
    .filter((image) => image.box.w * image.box.h / slideArea >= 0.08)
    .map((image) => image.box);
  if (cropBoxes.length === 0) return 0;
  const missingSourceText = sourceTextBoxes
    .filter((textBox) => isFiniteBox(textBox?.box) && typeof textBox.text === "string" && textBox.text.trim().length >= 2)
    .filter((textBox) => textBox.source?.segmentedOcrLineId === undefined)
    .filter((textBox) => Number(textBox.source?.confidence || textBox.confidence || 0) >= 0.8)
    .filter((textBox) => cropBoxes.some((cropBox) => isStrictlyInside(textBox.box, cropBox)))
    .filter((textBox) => !page.textBoxes.some((existing) => isFiniteBox(existing?.box)
      && intersectionArea(existing.box, textBox.box) / Math.max(1, textBox.box.w * textBox.box.h) >= 0.45))
    .map((textBox) => ({
      ...textBox,
      font: { ...(textBox.font || {}), opacity: 1 },
      ...visibleOcrRunsPatch(textBox),
      style: { ...(textBox.style || {}), visibility: "visible", opacity: 1 }
    }));
  if (missingSourceText.length < 5) return 0;
  let image;
  try {
    image = sourceFile ? readPng(sourceFile) : null;
  } catch {
    image = null;
  }
  const components = createLineTextNativeComponentObjects({ lines, textBoxes: [...page.textBoxes, ...missingSourceText], slideSize, image });
  const additions = components.shapes
    .filter((shape) => !page.shapes.some((existing) => sameNativeShape(existing, shape)));
  const textAdditions = components.textBoxes
    .filter((textBox) => !page.textBoxes.some((existing) => sameNativeTextBox(existing, textBox)));
  if (additions.length === 0) return 0;
  const backgroundAdditions = additions.filter(isRecoveredLineTextBackgroundShape);
  const foregroundAdditions = additions.filter((shape) => !isRecoveredLineTextBackgroundShape(shape));
  page.shapes = [...backgroundAdditions, ...page.shapes, ...foregroundAdditions];
  if (textAdditions.length > 0) page.textBoxes = [...page.textBoxes, ...textAdditions];
  return additions.length + textAdditions.length;
}

function promoteLineTextCropOcrText(page = {}, sourceTextBoxes = []) {
  if (!Array.isArray(page.images) || !Array.isArray(page.textBoxes) || !Array.isArray(sourceTextBoxes)) return 0;
  const dropCrops = page.images.filter((image) => shouldDropLineTextCoveredForegroundCrop(image, page));
  if (dropCrops.length === 0) return 0;
  const existingIds = new Set(page.textBoxes.map((item) => String(item?.id || "")));
  const additions = [];
  for (const item of sourceTextBoxes) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !isFiniteBox(item.box) || typeof item.text !== "string") continue;
    if (item.text.trim().length < 2 || Number(item.source?.confidence || item.confidence || 0) < 0.8) continue;
    if (existingIds.has(String(item.id || ""))) continue;
    if (page.textBoxes.some((existing) => isFiniteBox(existing?.box) && intersectionArea(existing.box, item.box) / Math.max(1, item.box.w * item.box.h) >= 0.45)) continue;
    const owners = dropCrops.filter((crop) => isStrictlyInside(item.box, crop.box));
    if (owners.length === 0) continue;
    const host = lineTextCropTextHostShape(page, item.box);
    const hostTextStyle = host ? lineTextHostTextStyle(host, item) : null;
    const visibleFont = { ...(item.font || {}), ...(hostTextStyle || {}), opacity: 1 };
    const promoted = {
      ...item,
      id: item.id ? `line-text-crop-${item.id}` : `line-text-crop-${additions.length + 1}`,
      font: visibleFont,
      ...visibleOcrRunsPatch(item, visibleFont),
      style: { ...(item.style || {}), visibility: "visible", opacity: 1, wrap: false, fit: "shrink" },
      source: {
        ...(item.source || {}),
        editable: true,
        nativeRebuild: true,
        overlayVisibility: "visible",
        ocrRecoveredFromLineTextCrop: true,
        lineTextCropIds: owners.map((crop) => String(crop.id || "")).filter(Boolean)
      }
    };
    additions.push(promoted);
    existingIds.add(String(promoted.id || ""));
  }
  page.textBoxes.push(...additions);
  return additions.length;
}

function lineTextCropTextHostShape(page = {}, textBox = {}) {
  if (!Array.isArray(page.shapes) || !isFiniteBox(textBox)) return null;
  const textArea = textBox.w * textBox.h;
  const textCenter = { x: textBox.x + textBox.w / 2, y: textBox.y + textBox.h / 2 };
  let best = null;
  let bestScore = 0;
  let bestFallback = null;
  let bestFallbackScore = 0;
  for (const shape of page.shapes) {
    if (!isNativeLineTextTextCarrier(shape) || !isFiniteBox(shape.box)) continue;
    const fill = parseHexColor(shape.style?.fill);
    if (!fill) continue;
    const directOverlap = intersectionArea(shape.box, textBox) / Math.max(1, textArea);
    const centerDistance = Math.hypot(
      textCenter.x - (shape.box.x + shape.box.w / 2),
      textCenter.y - (shape.box.y + shape.box.h / 2)
    );
    if (directOverlap >= 0.35) {
      if (isSaturatedDarkFill(fill) && !pointInsideBox(textCenter, shape.box) && directOverlap < 0.55) continue;
      const shapeArea = shape.box.w * shape.box.h;
      const areaPenalty = Math.min(1200, (shapeArea / Math.max(1, textArea)) * 3);
      const score = directOverlap * 2000 - centerDistance - areaPenalty;
      if (score > bestScore) {
        best = shape;
        bestScore = score;
      }
      continue;
    }
    if (!isSaturatedDarkFill(fill)) continue;
    if (!pointInsideBox(textCenter, shape.box) && directOverlap < 0.55) continue;
    const expanded = {
      x: shape.box.x - Math.max(8, textBox.w * 0.8),
      y: shape.box.y - Math.max(8, textBox.h * 1.2),
      w: shape.box.w + Math.max(16, textBox.w * 1.6),
      h: shape.box.h + Math.max(16, textBox.h * 2.4)
    };
    const overlap = intersectionArea(expanded, textBox) / Math.max(1, textArea);
    if (overlap < 0.55) continue;
    const score = overlap * 1000 - centerDistance;
    if (score > bestFallbackScore) {
      bestFallback = shape;
      bestFallbackScore = score;
    }
  }
  if (best && bestFallback && isBroadLineTextHost(best, textBox) && bestFallbackScore >= 800) return bestFallback;
  return best || bestFallback;
}

function pointInsideBox(point = {}, box = {}) {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && isFiniteBox(box)
    && point.x >= box.x && point.x <= box.x + box.w
    && point.y >= box.y && point.y <= box.y + box.h;
}

function lineTextHostTextStyle(shape = {}, item = {}) {
  const fill = parseHexColor(shape?.style?.fill);
  if (!fill || !isFiniteBox(item?.box)) return null;
  if (isSaturatedDarkFill(fill)) return { color: "#FFFFFF", align: "center" };
  if (isLightTextCarrierFill(fill)) return { color: visibleSourceOcrTextColor(item) };
  return null;
}

function isBroadLineTextHost(shape = {}, textBox = {}) {
  if (!isFiniteBox(shape?.box) || !isFiniteBox(textBox)) return false;
  const detector = String(shape?.source?.detector || "");
  const areaRatio = (shape.box.w * shape.box.h) / Math.max(1, textBox.w * textBox.h);
  return /^line-text-native-(?:group-panel|numbered-section-panel|section-panel|title-band-panel)$/u.test(detector) && areaRatio >= 55;
}

function promoteSourceOcrTextInNativeLineTextShapes(page = {}, sourceTextBoxes = []) {
  if (!Array.isArray(page.shapes) || !Array.isArray(page.textBoxes) || !Array.isArray(sourceTextBoxes)) return 0;
  const carrierBoxes = page.shapes
    .filter((shape) => isNativeLineTextTextCarrier(shape))
    .map((shape) => shape.box)
    .filter(isFiniteBox);
  if (carrierBoxes.length === 0) return 0;
  const existingIds = new Set(page.textBoxes.map((item) => String(item?.id || "")));
  const additions = [];
  for (const item of sourceTextBoxes) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !isFiniteBox(item.box) || typeof item.text !== "string") continue;
    const value = item.text.trim();
    if (value.length < 2 || Number(item.source?.confidence || item.confidence || 0) < 0.8) continue;
    if (existingIds.has(String(item.id || ""))) continue;
    if (!carrierBoxes.some((box) => isStrictlyInside(item.box, box))) continue;
    if (page.textBoxes.some((existing) => isFiniteBox(existing?.box)
      && intersectionArea(existing.box, item.box) / Math.max(1, item.box.w * item.box.h) >= 0.45)) continue;
    additions.push({
      ...item,
      font: { ...(item.font || {}), color: visibleSourceOcrTextColor(item), opacity: 1 },
      ...visibleOcrRunsPatch(item, { ...(item.font || {}), color: visibleSourceOcrTextColor(item), opacity: 1 }),
      style: { ...(item.style || {}), visibility: "visible", opacity: 1, wrap: false, fit: "shrink" },
      source: {
        ...(item.source || {}),
        editable: true,
        nativeRebuild: true,
        overlayVisibility: "visible",
        ocrRecoveredFromNativeLineTextShape: true
      }
    });
    existingIds.add(String(item.id || ""));
  }
  if (additions.length === 0) return 0;
  page.textBoxes.push(...additions);
  return additions.length;
}

function visibleOcrRunsPatch(item = {}, fallbackFont = {}) {
  if (!Array.isArray(item.runs)) return {};
  const text = typeof item.text === "string" ? item.text : "";
  const runsText = item.runs.map((run) => typeof run?.text === "string" ? run.text : "").join("");
  if (runsText !== text) return { runs: undefined };
  const preserveRunColors = Number(item.source?.mixedColorTextRuns || 0) > 1;
  return {
    runs: item.runs
      .filter((run) => typeof run?.text === "string" && run.text.length > 0)
      .map((run) => ({
        text: run.text,
        font: {
          ...(fallbackFont || {}),
          ...(run.font || {}),
          ...(preserveRunColors ? {} : { color: fallbackFont.color || run.font?.color }),
          opacity: 1
        }
      }))
  };
}

function normalizeVisibleTextRuns(page = {}) {
  if (!Array.isArray(page.textBoxes)) return 0;
  let changed = 0;
  for (const textBox of page.textBoxes) {
    if (!textBox || typeof textBox !== "object" || Array.isArray(textBox) || !Array.isArray(textBox.runs)) continue;
    const text = typeof textBox.text === "string" ? textBox.text : "";
    const runsText = textBox.runs.map((run) => typeof run?.text === "string" ? run.text : "").join("");
    if (runsText !== text) {
      delete textBox.runs;
      changed += 1;
      continue;
    }
    if (!isVisibleTextBox(textBox)) continue;
    const opacity = visibleTextOpacity(textBox);
    let runChanged = false;
    textBox.runs = textBox.runs.map((run) => {
      const font = { ...(textBox.font || {}), ...(run.font || {}), opacity };
      if (run.font?.opacity !== opacity) runChanged = true;
      return { text: run.text, font };
    });
    if (runChanged) changed += 1;
  }
  return changed;
}

function isVisibleTextBox(textBox = {}) {
  if (textBox.style?.visibility === "hidden" || textBox.source?.overlayVisibility === "hidden") return false;
  if (textBox.style?.opacity === 0 || textBox.font?.opacity === 0) return false;
  return true;
}

function visibleTextOpacity(textBox = {}) {
  const fontOpacity = Number(textBox.font?.opacity);
  if (Number.isFinite(fontOpacity)) return Math.max(0, Math.min(1, fontOpacity));
  const styleOpacity = Number(textBox.style?.opacity);
  if (Number.isFinite(styleOpacity)) return Math.max(0, Math.min(1, styleOpacity));
  return 1;
}

function isNativeLineTextTextCarrier(shape = {}) {
  if (!isFiniteBox(shape?.box) || shape?.source?.editable === false) return false;
  const detector = String(shape?.source?.detector || "");
  return /^line-text-native-(?:bordered-card|card-row|color-panel|grid-cell|group-panel|matrix-cell|numbered-section-panel|section-panel|stack-bar|title-band-panel)$/u.test(detector);
}

function visibleSourceOcrTextColor(item = {}) {
  const color = typeof item.font?.color === "string" ? item.font.color : "";
  return /^#[0-9a-f]{6}$/iu.test(color) && color.toUpperCase() !== "#111111" ? color : "#202637";
}

function parseHexColor(value) {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/iu.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: 255
  };
}

function isSaturatedDarkFill(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const brightness = (color.r + color.g + color.b) / 3;
  return brightness < 180 && max - min >= 36;
}

function isLightTextCarrierFill(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const brightness = (color.r + color.g + color.b) / 3;
  return brightness >= 190 && max - min <= 80;
}

function isFiniteBox(box) {
  return box && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(box[key]))) && Number(box.w) > 0 && Number(box.h) > 0;
}

function isStrictlyInside(inner, outer) {
  return isFiniteBox(inner) && isFiniteBox(outer)
    && inner.x >= outer.x + 2
    && inner.y >= outer.y + 2
    && inner.x + inner.w <= outer.x + outer.w - 2
    && inner.y + inner.h <= outer.y + outer.h - 2;
}

function intersectionArea(left, right) {
  return Math.max(0, Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y));
}

function isRecoveredLineTextBackgroundShape(shape = {}) {
  const detector = String(shape?.source?.detector || "");
  return shape?.type === "rect"
    && detector.startsWith("line-text-native-")
    && (shape?.source?.nativeComponentRole === "section-panel"
      || shape?.source?.nativeComponentRole === "table-cell"
      || detector === "line-text-native-card-row"
      || detector === "line-text-native-bordered-card");
}

function ensureUniquePageObjectIds(page = {}) {
  const seen = new Set();
  for (const collection of ["textBoxes", "shapes", "images", "tables", "charts", "icons"]) {
    const items = Array.isArray(page?.[collection]) ? page[collection] : [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || typeof item !== "object") continue;
      const raw = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `${collection}-${index + 1}`;
      const base = raw.length <= 220 ? raw : raw.slice(0, 220);
      let id = base;
      let suffix = 2;
      while (seen.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
      }
      item.id = id;
      seen.add(id);
    }
  }
}

function sameNativeShape(left = {}, right = {}) {
  if (String(left?.source?.detector || "") !== String(right?.source?.detector || "")) return false;
  const a = left.box || {};
  const b = right.box || {};
  if (["x", "y", "w", "h"].every((key) => Math.abs(Number(a[key] || 0) - Number(b[key] || 0)) <= 0.5)) return true;
  if (!isFiniteBox(a) || !isFiniteBox(b)) return false;
  const overlap = intersectionArea(a, b);
  const leftArea = Number(a.w) * Number(a.h);
  const rightArea = Number(b.w) * Number(b.h);
  const minArea = Math.min(leftArea, rightArea);
  const maxArea = Math.max(leftArea, rightArea);
  const detector = String(left?.source?.detector || "");
  if (detector === "line-text-native-card-row" && overlap / Math.max(1, minArea) >= 0.88 && minArea / Math.max(1, maxArea) >= 0.55) return true;
  return overlap / Math.max(1, minArea) >= 0.9 && minArea / Math.max(1, maxArea) >= 0.68;
}

function sameNativeTextBox(left = {}, right = {}) {
  if (String(left?.text || "").trim() !== String(right?.text || "").trim()) return false;
  if (!isFiniteBox(left?.box) || !isFiniteBox(right?.box)) return false;
  const overlap = intersectionArea(left.box, right.box);
  const leftArea = Number(left.box.w) * Number(left.box.h);
  const rightArea = Number(right.box.w) * Number(right.box.h);
  const minArea = Math.min(leftArea, rightArea);
  return overlap / Math.max(1, minArea) >= 0.45;
}

function createRawImageNativeRebuilder({ rebuildDeckFromWorkDir, normalizeImageFile, refineSourceOcr, reviewSourceScene, compileSourceScene, preflightSourceScene, createFullSlideResidual, refineSemanticImages, admitSemanticShapes, restoreOcrGlyphs, refineGrayBorders, refineNativeEdges, resolveComponentIndexes, applyApprovedFrames, preserveLocalFidelityImages = false, connectorCornerMode, outputPolicy, createSemanticFallbackPipeline = createDeclarativePipeline } = {}) {
  if (typeof rebuildDeckFromWorkDir !== "function") throw new TypeError("native image rebuild implementation is required");
  if (resolveComponentIndexes !== undefined && typeof resolveComponentIndexes !== "function") throw new TypeError("native image component resolver is invalid");
  if (applyApprovedFrames !== undefined && typeof applyApprovedFrames !== "function") throw new TypeError("native image approved frame service is invalid");
  if (normalizeImageFile !== undefined && typeof normalizeImageFile !== "function") throw new TypeError("native image normalizer is invalid");
  if (refineSourceOcr !== undefined && typeof refineSourceOcr !== "function") throw new TypeError("native image source OCR refiner is invalid");
  if (reviewSourceScene !== undefined && typeof reviewSourceScene !== "function") throw new TypeError("native image source scene reviewer is invalid");
  if (compileSourceScene !== undefined && typeof compileSourceScene !== "function") throw new TypeError("native image source scene compiler is invalid");
  if (preflightSourceScene !== undefined && typeof preflightSourceScene !== "function") throw new TypeError("native image source scene preflight is invalid");
  if (createFullSlideResidual !== undefined && typeof createFullSlideResidual !== "function") throw new TypeError("native image residual builder is invalid");
  if (refineSemanticImages !== undefined && typeof refineSemanticImages !== "function") throw new TypeError("native image semantic crop refiner is invalid");
  if (admitSemanticShapes !== undefined && typeof admitSemanticShapes !== "function") throw new TypeError("native image semantic shape admission is invalid");
  if (restoreOcrGlyphs !== undefined && typeof restoreOcrGlyphs !== "function") throw new TypeError("native image OCR glyph restorer is invalid");
  if (refineGrayBorders !== undefined && typeof refineGrayBorders !== "function") throw new TypeError("native image gray border refiner is invalid");
  if (refineNativeEdges !== undefined && typeof refineNativeEdges !== "function") throw new TypeError("native image edge refiner is invalid");
  if (createSemanticFallbackPipeline !== undefined && typeof createSemanticFallbackPipeline !== "function") throw new TypeError("native image semantic fallback pipeline is invalid");
  if (typeof preserveLocalFidelityImages !== "boolean") throw new TypeError("native image local fidelity policy is invalid");
  if (restoreOcrGlyphs && createFullSlideResidual && !preserveLocalFidelityImages) throw new TypeError("native image OCR glyph restoration requires preserved local images");
  const nativeEdgeRefiner = refineNativeEdges || refineSourceNativeEdges;
  const grayBorderRefiner = refineGrayBorders || refineGrayBorderResiduals;
  connectorCornerMode = require("./routing/source-route-corner-mode").parseConnectorCornerMode(connectorCornerMode);
  outputPolicy = parseNativeOutputPolicy(outputPolicy);
  return async ({ root, metadata, ocr, isCancellationRequested, recoverOcrCropText = true, recoverOcrCropIds }) => withApprovedBackdropBudget(async () => {
    if (typeof root !== "string" || !path.isAbsolute(root) || !metadata || typeof metadata.inputFile !== "string") throw new TypeError("native image rebuild request is invalid");
    if (typeof recoverOcrCropText !== "boolean") throw new TypeError("native image OCR recovery policy is invalid");
    const workDir = path.join(root, "native-work");
    const normalizedDir = path.join(workDir, "normalized");
    const sourceFile = path.join(normalizedDir, "001.png");
    fs.mkdirSync(path.join(workDir, "ir"), { recursive: true });
    fs.mkdirSync(normalizedDir, { recursive: true });
    if (path.extname(metadata.inputFile).toLowerCase() === ".png") fs.copyFileSync(metadata.inputFile, sourceFile);
    else if (normalizeImageFile) await normalizeImageFile({ inputFile: metadata.inputFile, outputFile: sourceFile, dimensions: metadata.dimensions, isCancellationRequested });
    else throw new Error("native image rebuild requires a configured JPEG normalizer");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    // The shared resolver supports work-directory-relative image paths.
    const sourceWordSession = createSourceWordLayoutSession(sourceFile);
    const sourceRaster = sourceWordSession.image;
    // Scene label identities bind source geometry. Finalize and validate that
    // geometry before planning so preflight and final projection share it.
    if (refineSourceOcr) ocr = admitOcrResult(await refineSourceOcr({ root, sourceFile, dimensions: metadata.dimensions, ocr, isCancellationRequested }), metadata.dimensions);
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const sceneReview = reviewSourceScene ? await reviewSourceScene({ root, sourceFile, dimensions: metadata.dimensions, ocr, isCancellationRequested,
      ...(preflightSourceScene?{preflightSourceScene:(plan,compilationSession)=>{
        const draft=boundedOcrSourceDeck({metadata,ocr,sourceImage:'normalized/001.png',sourceRaster,sourceWordSession:sourceWordSession.token});
        return preflightSourceScene({page:draft.pages[0],plan,sourceFile,root,slideSize:draft.slideSize,connectorCornerMode,pictorialMode:preserveLocalFidelityImages?"source-crop":"native",
          ...(compilationSession!==undefined?{compilationSession}:{})});
      }}:{}) }) : null;
    if (sceneReview) ocr = sceneReview.ocr;
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const sourceDeck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "normalized/001.png", sourceRaster, sourceWordSession:sourceWordSession.token });
    const admittedSourceDeck = restoreOcrGlyphs ? boundedOcrSourceDeck({ metadata, ocr, sourceImage: "normalized/001.png", sourceRaster, sourceWordSession:sourceWordSession.token, preserveUncertainGlyphs: true }) : sourceDeck;
    const sourceTextBoxesForTextRecovery = expandPositionedMixedColorTextSegments(sourceDeck.pages[0].textBoxes);
    const admittedTextBoxesForTextRecovery = expandPositionedMixedColorTextSegments(admittedSourceDeck.pages[0].textBoxes);
    fs.writeFileSync(path.join(workDir, "ir", "deck.json"), `${JSON.stringify(sourceDeck)}\n`, "utf8");
    const semanticFallbackContext = metadata.semanticFallback === undefined ? null : semanticFallbackToPageContext(metadata.semanticFallback, { slideSize: sourceDeck.slideSize, pageIndex: 0 });
    const components = resolveComponentIndexes ? await resolveComponentIndexes({ workDir, root, metadata, isCancellationRequested }) : undefined;
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const componentOptions = {};
    for (const name of ["componentStrategyIndex", "componentAssetIndex"]) {
      if (components?.[name] !== undefined) {
        if (!(components[name] instanceof Map)) throw new TypeError("native image component index is invalid");
        componentOptions[name] = components[name];
      }
    }
    const sourceCropCapture = captureSourceCropRegistrations(sourceRaster, root, sourceDeck.slideSize, () => rebuildDeckFromWorkDir(workDir, {
      ...createProductionNativeRebuildOptions(),
      ...componentOptions,
      pages: "1",
      irDir: root,
      assetDir: path.join(root, "assets"),
      deckName: "deck"
    }));
    const generatedDeck = sourceCropCapture.result;
    assertUnverifiedRegionTextPreserved(generatedDeck.pages[0], admittedSourceDeck.pages[0].textBoxes);
    if (sceneReview) generatedDeck.meta = { ...(generatedDeck.meta || {}), sourceSceneReview: sceneReview.evidence };
    applySemanticFallbackPipeline(generatedDeck.pages[0], semanticFallbackContext, createSemanticFallbackPipeline);
    const solidRegionNativeBackgrounds = addSolidRegionNativeBackgrounds(generatedDeck.pages[0], generatedDeck.slideSize, sourceFile);
    if (solidRegionNativeBackgrounds > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), solidRegionNativeBackgrounds };
    }
    const lowContrastFooterNativeMarks = addLowContrastFooterNativeMarks(generatedDeck.pages[0], generatedDeck.slideSize, sourceFile);
    if (lowContrastFooterNativeMarks > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), lowContrastFooterNativeMarks };
    }
    const finalTextGroupNativeShapes = addFinalTextGroupNativeComponents(generatedDeck.pages[0], generatedDeck.slideSize, sourceFile);
    if (finalTextGroupNativeShapes > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), finalTextGroupNativeShapes };
    }
    const sourceOcrLineTextNativeShapes = addSourceOcrLineTextNativeComponents(generatedDeck.pages[0], generatedDeck.slideSize, sourceFile, sourceDeck.pages[0].textBoxes);
    if (sourceOcrLineTextNativeShapes > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), sourceOcrLineTextNativeShapes };
    }
    const lineTextCropOcrTextPromoted = promoteLineTextCropOcrText(generatedDeck.pages[0], sourceTextBoxesForTextRecovery);
    if (lineTextCropOcrTextPromoted > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), lineTextCropOcrTextPromoted };
    }
    applySourceNativeEdgeRefinement({ generatedDeck, sourceFile, refineNativeEdges: nativeEdgeRefiner });
    const imagesBeforeLineTextDrop = Array.isArray(generatedDeck.pages[0].images) ? generatedDeck.pages[0].images.length : 0;
    dropLineTextCoveredForegroundCrops(generatedDeck.pages[0]);
    const lineTextCoveredForegroundCropsDropped = imagesBeforeLineTextDrop - (Array.isArray(generatedDeck.pages[0].images) ? generatedDeck.pages[0].images.length : 0);
    if (lineTextCoveredForegroundCropsDropped > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), lineTextCoveredForegroundCropsDropped };
    }
    if (components?.evidence) generatedDeck.pages[0].source = { ...generatedDeck.pages[0].source, componentAnalysis: components.evidence };
    if (restoreOcrGlyphs && admittedSourceDeck.meta.ocrAdmission.rasterFallbackGlyphs > 0) {
      const admittedIds = new Set(admittedSourceDeck.pages[0].textBoxes.map(item => item.id));
      const glyphs = sourceDeck.pages[0].textBoxes.filter(item => !admittedIds.has(item.id));
      const restored = await restoreOcrGlyphs({ page: generatedDeck.pages[0], slideSize: generatedDeck.slideSize, sourceFile, root, glyphs });
      if (restored?.restoredGlyphs !== glyphs.length) throw new Error("native image OCR glyph restoration is incomplete");
    }
    const semanticTransaction = await runSemanticRebuildTransaction({
      page: generatedDeck.pages[0],
      isCancellationRequested,
      rebuild: ({ page }) => applyKnowledgeGraphPanelNativeRebuild(page, generatedDeck.slideSize, {
        semanticTextBoxes: admittedSourceDeck.pages[0].textBoxes,
        sourceImageWidthPx: metadata?.dimensions?.widthPx
      }),
      refine: refineSemanticImages ? ({ page }) => refineSemanticImages({ page, slideSize: generatedDeck.slideSize, sourceFile, root, metadata, isCancellationRequested }) : undefined,
      connect: refineSemanticImages ? ({ page, refinement }) => refinement?.nativePictorialPreserved === true
        ? { matched: true, added: 0, nativePictorialPreserved: true }
        : refinement?.matched ? addKnowledgeGraphPictorialConnectors(page, generatedDeck.slideSize) : { matched: false, added: 0 } : undefined,
      // Reject unsupported geometry before computing erase masks, so its source
      // pixels remain available to the raster fallback.
      admit: admitSemanticShapes ? ({ page }) => admitSemanticShapes({ page, slideSize: generatedDeck.slideSize, sourceFile }) : undefined
    });
    let semanticNative = semanticTransaction.refinement === undefined
      ? semanticTransaction.rebuildResult
      : Object.freeze({ ...semanticTransaction.rebuildResult, imageRefinement: semanticTransaction.refinement, pictorialConnectors: semanticTransaction.connection });
    if (semanticTransaction.admissionEvidence !== undefined) {
      const rejected = semanticTransaction.admissionEvidence.rejected;
      semanticNative = Object.freeze({ ...semanticNative, addedShapes: semanticNative.addedShapes - rejected, connectors: semanticNative.connectors - rejected, shapeAdmission: semanticTransaction.admissionEvidence });
    }
    if (semanticTransaction.published) {
      const publishedPage = semanticTransaction.page;
      if (semanticTransaction.admissionEvidence !== undefined) {
        if (!publishedPage.source || typeof publishedPage.source !== "object" || Array.isArray(publishedPage.source)
          || !publishedPage.source.semanticNativeStructure || typeof publishedPage.source.semanticNativeStructure !== "object"
          || Array.isArray(publishedPage.source.semanticNativeStructure)) throw new TypeError("semantic rebuild publication metadata is invalid");
        publishedPage.source.semanticNativeStructure.shapeAdmission = semanticTransaction.admissionEvidence;
      }
      generatedDeck.pages[0] = publishedPage;
    }
    if (semanticNative.matched) applySourceNativeEdgeRefinement({ generatedDeck, sourceFile, refineNativeEdges: nativeEdgeRefiner });
    const residualCropNativeReplacement = replaceResidualCropsWithNativeComponents({ page: generatedDeck.pages[0], root });
    if (residualCropNativeReplacement.replaced > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), residualCropNativeReplacement };
    }
    const baseOcrCropRecovery = recoverOcrCropText ? recoverMissingOcrText({
      page: generatedDeck.pages[0], sourceTextBoxes: admittedTextBoxesForTextRecovery,
      slideSize: generatedDeck.slideSize, root, preserveLocalFidelityImages, allowedCropIds: recoverOcrCropIds
    }) : { recovered: 0, cropsErased: 0 };
    if (baseOcrCropRecovery.recovered > 0) {
      generatedDeck.pages[0].textBoxes = fitHighConfidenceSingleLineOcrToEvidence(generatedDeck.pages[0].textBoxes);
    }
    const recoveredLineTextNativeShapes = baseOcrCropRecovery.recovered > 0
      ? addRecoveredLineTextNativeComponents(generatedDeck.pages[0], generatedDeck.slideSize, sourceFile)
      : 0;
    if (recoveredLineTextNativeShapes > 0) applySourceNativeEdgeRefinement({ generatedDeck, sourceFile, refineNativeEdges: nativeEdgeRefiner });
    if (baseOcrCropRecovery.recovered > 0) dropLineTextCoveredForegroundCrops(generatedDeck.pages[0]);
    const ocrCropRecovery = recoveredLineTextNativeShapes > 0
      ? { ...baseOcrCropRecovery, recoveredLineTextNativeShapes }
      : baseOcrCropRecovery;
    generatedDeck.meta = { ...(generatedDeck.meta || {}), ocrCropRecovery };
    const sourceOcrNativeLineTextPromoted = promoteSourceOcrTextInNativeLineTextShapes(generatedDeck.pages[0], sourceTextBoxesForTextRecovery);
    if (sourceOcrNativeLineTextPromoted > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), sourceOcrNativeLineTextPromoted };
    }
    const lineTextCropOcrTextPromotedAfterSource = promoteLineTextCropOcrText(generatedDeck.pages[0], sourceTextBoxesForTextRecovery);
    const imagesBeforeSourceLineTextDrop = Array.isArray(generatedDeck.pages[0].images) ? generatedDeck.pages[0].images.length : 0;
    dropLineTextCoveredForegroundCrops(generatedDeck.pages[0]);
    const lineTextCoveredForegroundCropsDroppedAfterSource = imagesBeforeSourceLineTextDrop - (Array.isArray(generatedDeck.pages[0].images) ? generatedDeck.pages[0].images.length : 0);
    if (lineTextCropOcrTextPromotedAfterSource > 0 || lineTextCoveredForegroundCropsDroppedAfterSource > 0) {
      generatedDeck.meta = {
        ...(generatedDeck.meta || {}),
        ...(lineTextCropOcrTextPromotedAfterSource > 0 ? { lineTextCropOcrTextPromotedAfterSource } : {}),
        ...(lineTextCoveredForegroundCropsDroppedAfterSource > 0 ? { lineTextCoveredForegroundCropsDroppedAfterSource } : {})
      };
    }
    const visiblePositionedMixedColorTextSegmentsExpanded = expandVisiblePositionedMixedColorTextSegments(generatedDeck.pages[0]);
    if (visiblePositionedMixedColorTextSegmentsExpanded > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), visiblePositionedMixedColorTextSegmentsExpanded };
    }
    const visibleTextRunsNormalized = normalizeVisibleTextRuns(generatedDeck.pages[0]);
    if (visibleTextRunsNormalized > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), visibleTextRunsNormalized };
    }
    const droppedLineTextCoveredSolidRegions = dropSolidRegionsCoveredByLineTextPanels(generatedDeck.pages[0]);
    if (droppedLineTextCoveredSolidRegions > 0) {
      generatedDeck.meta = { ...(generatedDeck.meta || {}), droppedLineTextCoveredSolidRegions };
    }
    let sceneGroupReceipt,sceneOpenOwnerReceipt,sceneNativeRouteReceipt;
    if (sceneReview?.plan && compileSourceScene) {
      const compiled = compileSourceScene({ page: generatedDeck.pages[0], plan: sceneReview.plan, sourceFile, root, slideSize: generatedDeck.slideSize,connectorCornerMode,deferNativeRoutes:connectorCornerMode==='reroutable-elbow',pictorialMode:preserveLocalFidelityImages?"source-crop":"native",sourceCropSession:sourceCropCapture.token,
        ...(sceneReview.sourceIconReview!==undefined?{sourceIconReview:sceneReview.sourceIconReview}:{}),
        ...(sceneReview.sourceRouteCatalogs!==undefined?{sourceRouteCatalogs:sceneReview.sourceRouteCatalogs}:{}),
        ...(sceneReview.compilationSession!==undefined?{compilationSession:sceneReview.compilationSession}:{}) });
      generatedDeck.pages[0] = compiled.page;
      sceneGroupReceipt=compiled.groupReceipt;
      sceneOpenOwnerReceipt=compiled.openOwnerReceipt;
      sceneNativeRouteReceipt=compiled.nativeRouteReceipt;
      let compilationEvidence=compiled.evidence;
      if(compiled.evidence.observedInventory){
        const inventory=require('./scene-plan/source-scene-inventory-artifact').writeSceneInventoryArtifact(root,compiled.evidence.observedInventory);
        compilationEvidence={regions:compiled.evidence.regions,relations:compiled.evidence.relations,resolvedRelations:compiled.evidence.resolvedRelations,
          unresolved:compiled.evidence.unresolved,regionPrograms:compiled.evidence.regionPrograms,sourceScanPixels:compiled.evidence.sourceScanPixels,
          observedInventory:inventory,details:'pages[0].source.sourceScene'};
        const source=generatedDeck.pages[0].source;
        const packed=require('./scene-plan/source-scene-inventory-codec').packSceneInventoryMembers(compiled.evidence.observedInventory);
        generatedDeck.pages[0]={...generatedDeck.pages[0],source:{...source,sourceScene:{...source.sourceScene,observedInventory:packed}}};
      }
      generatedDeck.meta = { ...generatedDeck.meta, sourceSceneCompilation: compilationEvidence };
    }
      if(sceneReview?.graphics?.length)generatedDeck.pages[0].images.push(...mapReviewedSceneGraphics(sceneReview.graphics,metadata.dimensions,generatedDeck.slideSize));
    if(sceneReview)generatedDeck.pages[0]=withReviewedGraphicEvidence(generatedDeck.pages[0],sceneReview.evidence);
    if (createFullSlideResidual) {
      const residualAssetPath = "assets/deck-p01-full-residual.png";
      const page = generatedDeck?.pages?.[0];
      const slideSize = generatedDeck?.slideSize;
      if (!page || !Array.isArray(page.textBoxes) || !Number.isFinite(slideSize?.widthPt) || !Number.isFinite(slideSize?.heightPt)) throw new Error("native image rebuild produced an invalid page");
      const localFidelityImages = preserveLocalFidelityImages ? [...(Array.isArray(page.images) ? page.images : [])] : [];
      const omitFullSlideResidual = admittedSourceDeck.meta.ocrAdmission.rasterFallbackGlyphs === 0
        && (shouldOmitFullSlideResidual(semanticNative)
          || shouldOmitFullSlideResidualAfterOcrRecovery(page, slideSize, ocrCropRecovery));
      if (omitFullSlideResidual) {
        ungroupHybridOverlayObjects(page,sceneGroupReceipt,sceneOpenOwnerReceipt);
        page.images = localFidelityImages;
        generatedDeck.meta = { ...(generatedDeck.meta || {}), semanticNative, reconstructionProfile: PRODUCTION_PROFILE_NAME, preservedLocalFidelityImages: localFidelityImages.length, fullSlideResidualOmitted: true, residualDeduplication: { candidateObjects: 0, erasedObjects: 0 } };
      } else {
      const eraseObjects = residualEraseObjects(page, { includeLocalFidelityImages: preserveLocalFidelityImages });
      const residualBranch = await attemptSourceResidual(() => createFullSlideResidual({
        sourceFile,
        outputFile: path.join(root, ...residualAssetPath.split("/")),
        objects: eraseObjects,
        sourceShapes: page.shapes,
        slideSize: { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt },
        isCancellationRequested
      }));
      if (residualBranch.kind === "rejected") {
        // An unpublishable optional raster cannot suppress the independently
        // measured native layout. Keep its actual failure in the final audit.
        ungroupHybridOverlayObjects(page,sceneGroupReceipt,sceneOpenOwnerReceipt);
        page.images = localFidelityImages;
        generatedDeck.meta = { ...(generatedDeck.meta || {}), semanticNative, reconstructionProfile: PRODUCTION_PROFILE_NAME,
          preservedLocalFidelityImages: localFidelityImages.length, fullSlideResidualOmitted: true,
          residualBranchRejected: { code: "RESIDUAL_PIXEL_OWNERSHIP_REJECTED", pixelOwnership: residualBranch.pixelOwnership },
          residualDeduplication: { candidateObjects: eraseObjects.length, erasedObjects: 0 } };
      } else {
      const residual = residualBranch.residual;
      if (residual?.erasedObjects !== eraseObjects.length) throw new Error("native image residual deduplication is incomplete");
      ungroupHybridOverlayObjects(page,sceneGroupReceipt,sceneOpenOwnerReceipt);
      page.images = [{
        id: "full-slide-residual",
        type: "fidelity-crop",
        assetPath: residualAssetPath,
        box: { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt },
        style: { opacity: 1, assetPath: residualAssetPath, strategy: "full-slide-object-erased-residual" },
        source: {
          pageImage: metadata.assetPath,
          editable: false,
          residualCrop: true,
          fullSlideResidual: true,
          textObjectified: true,
          nativeObjectsErased: true,
          ...(residual.pixelOwnership ? { residualPixelOwnership: {
            provider: "residual-pixel-ownership-v1", passed: residual.pixelOwnership.passed,
            ownedForegroundRatio: residual.pixelOwnership.ownedForegroundPixels / (residual.widthPx * residual.heightPx),
            remainingOwnedForegroundRatio: residual.pixelOwnership.remainingOwnedForegroundPixels / (residual.widthPx * residual.heightPx),
            unownedChangedRatio: residual.pixelOwnership.unownedChangedPixels / (residual.widthPx * residual.heightPx)
          } } : {}),
          componentRenderStrategy: { mode: preserveLocalFidelityImages ? "preserve-crop-with-native-and-local-fidelity-overlays" : "preserve-crop-with-native-overlays" },
          strategy: "full-slide-object-erased-residual",
          nonEditableReason: "Complex pictorial details are preserved after independently editable text and native objects are removed from the residual."
        }
      }, ...localFidelityImages];
      generatedDeck.meta = { ...(generatedDeck.meta || {}), semanticNative, reconstructionProfile: PRODUCTION_PROFILE_NAME, preservedLocalFidelityImages: localFidelityImages.length, residualDeduplication: { candidateObjects: eraseObjects.length, erasedObjects: residual.erasedObjects } };
      }
      }
    }
    // Private region receipts bind the complete paint order. Consume them
    // before adding an independently witnessed page background; the background
    // grants no authority to change that sealed region or erase its source.
    const sourceBands = require('./typography/source-text-band-background').proposeSourceTextBandBackgrounds({
      image: readPng(sourceFile), slideSize: generatedDeck.slideSize, shapes: generatedDeck.pages[0].shapes
    });
    if (sourceBands.backgrounds.length) generatedDeck.pages[0].shapes.unshift(...sourceBands.backgrounds);
    generatedDeck.meta = { ...generatedDeck.meta, sourceTextBands: {
      backgrounds: sourceBands.backgrounds.length, checks: sourceBands.checks, exhausted: sourceBands.exhausted
    } };
    generatedDeck.meta = { ...(generatedDeck.meta || {}), reconstructionProfile: PRODUCTION_PROFILE_NAME, ocrAdmission: admittedSourceDeck.meta.ocrAdmission };
    copyDirectoryFiles(path.join(workDir, "ir", "assets"), path.join(root, "assets"));
    if (semanticNative.matched) {
      const grayBorderRefinement = await grayBorderRefiner({ page: generatedDeck.pages[0], slideSize: generatedDeck.slideSize, sourceFile, root, isCancellationRequested });
      generatedDeck.meta = { ...generatedDeck.meta, grayBorderRefinement };
    }
    let sourceNativeEdgeOwnerReassigned = 0;
    for (const [pageIndex, page] of (Array.isArray(generatedDeck.pages) ? generatedDeck.pages : []).entries()) {
      ensureUniquePageObjectIds(page);
      const finalized = finalizeSourceNativePage({ ...page, shapes: Array.isArray(page.shapes) ? page.shapes : [], images: Array.isArray(page.images) ? page.images : [] }, generatedDeck.slideSize, root);
      generatedDeck.pages[pageIndex] = finalized;
      sourceNativeEdgeOwnerReassigned += reassignSourceNativeEdgeOwners(finalized);
    }
    if (sourceNativeEdgeOwnerReassigned > 0) {
      generatedDeck.meta = {
        ...(generatedDeck.meta || {}),
        sourceNativeEdgeRefinement: mergeSourceNativeEdgeEvidence(generatedDeck.meta?.sourceNativeEdgeRefinement, { ownerReassigned: sourceNativeEdgeOwnerReassigned })
      };
    }
    const sourceWordLayout=applySourceWordLayouts(generatedDeck.pages[0],admittedSourceDeck.pages[0].textBoxes);
    generatedDeck.pages[0]=sourceWordLayout.page;
    if(sourceWordLayout.layouts)generatedDeck.meta={...generatedDeck.meta,sourceWordLayout:{layouts:sourceWordLayout.layouts,runs:sourceWordLayout.runs}};
    // Consume the private measured layout while it is still bound to the
    // normalized source. Portable path rewriting otherwise invalidates every
    // layout even though the source image and text have not changed.
    normalizeSourceAssetProvenance(generatedDeck, metadata.assetPath);
    compactTeamComponentEvidence(generatedDeck);
    return finalizeWithApprovedFrames(applyApprovedFrames, { deck: generatedDeck, root, sourceFile, isCancellationRequested, connectorCornerMode }, () => {
    const nativeRoutes=finalizeNativeRouteRepresentations({page:generatedDeck.pages[0],slideSize:generatedDeck.slideSize,connectorCornerMode,
      receipt:sceneNativeRouteReceipt,work:{checks:0}});
    // Approved materializations bind the actual page identity through commit.
    generatedDeck.pages[0].shapes=nativeRoutes.page.shapes;
    if(nativeRoutes.page.source!==undefined)generatedDeck.pages[0].source=nativeRoutes.page.source;
    generatedDeck.meta={...generatedDeck.meta,nativeRouteSelection:nativeRoutes.report};
    // Image selection audits the same private measured replacement as the final
    // component gate. Bind it first; the gate revalidates after final sealing.
    commitNativeRouteMaterialization({deck:generatedDeck,receipt:nativeRoutes.materializationReceipt});
    const selectedOutput=selectNativeOutputImages(generatedDeck,outputPolicy);
    if(selectedOutput){
      generatedDeck.pages[0].images=selectedOutput.images;
      generatedDeck.meta={...generatedDeck.meta,nativeOutputSelection:selectedOutput.report};
      const nodeGroups=groupSemanticNodes({page:generatedDeck.pages[0],work:{checks:0}});
      if(nodeGroups.page.outputEditGroups!==undefined)generatedDeck.pages[0].outputEditGroups=nodeGroups.page.outputEditGroups;
      generatedDeck.meta={...generatedDeck.meta,semanticNodeEditGrouping:nodeGroups.report};
    }
    sealSceneInventoryRevisionDeck(generatedDeck,root);
    sealSceneGlyphRecoveryDeck(generatedDeck);
    const nativeComponentQuality = auditNativeComponentQuality(generatedDeck);
    generatedDeck.meta = { ...(generatedDeck.meta || {}), nativeComponentQuality };
    const metrics = nativeObjectMetrics(generatedDeck);
    return Object.freeze({ deck: generatedDeck, metrics, sourceImage: sourceFile, residual: generatedDeck.meta?.residualDeduplication || null, reconstructionProfile: PRODUCTION_PROFILE_NAME, nativeComponentQuality, ocrCropRecovery: { sourceLines: admittedSourceDeck.meta.ocrAdmission.editableLines, ...ocrCropRecovery } });
    });
  });
}

function expandVisiblePositionedMixedColorTextSegments(page = {}) {
  if (!Array.isArray(page.textBoxes)) return 0;
  let changed = 0;
  const expanded = [];
  for (const textBox of page.textBoxes) {
    if (!textBox || typeof textBox !== "object" || Array.isArray(textBox) || !Array.isArray(textBox.source?.positionedMixedColorTextSegments)
      || !isVisibleTextBox(textBox)) {
      expanded.push(textBox);
      continue;
    }
    const segments = expandPositionedMixedColorTextSegments([textBox]);
    if (segments.length < 2) {
      expanded.push(textBox);
      continue;
    }
    for (const segment of segments) {
      expanded.push({
        ...segment,
        font: { ...(segment.font || {}), opacity: visibleTextOpacity(textBox) },
        style: { ...(segment.style || {}), visibility: "visible", opacity: visibleTextOpacity(textBox), wrap: false, fit: "shrink" },
        source: { ...(segment.source || {}), overlayVisibility: "visible", nativeRebuild: true, editable: true }
      });
    }
    changed += segments.length;
  }
  if (changed > 0) page.textBoxes = expanded;
  return changed;
}

module.exports = { assessOcrRecovery, addFinalTextGroupNativeComponents, addLowContrastFooterNativeMarks, addRecoveredLineTextNativeComponents, addSourceOcrLineTextNativeComponents, auditNativeComponentQuality, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, dropSolidRegionsCoveredByLineTextPanels, expandVisiblePositionedMixedColorTextSegments, largeRasterEditability, mayRecoverOcrCropText, nativeObjectMetrics, normalizeSourceAssetProvenance, ocrRecoveryCandidateScopes, promoteLineTextCropOcrText, promoteSourceOcrTextInNativeLineTextShapes, qualityRendered, rasterEditabilityDoesNotRegress, residualEraseObjects, selectNativeRebuildCandidate, selectOcrRecovery, shouldOmitFullSlideResidual, shouldOmitFullSlideResidualAfterOcrRecovery, shouldStopOcrRecoverySearch, shouldSuppressSolidRegionDueToLineTextPanel, tileLargeReconstructionRasters, ungroupHybridOverlayObjects, visualQualityDoesNotRegress, writeTextErasedVisualFallbackAsset };
