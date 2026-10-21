// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { readPng, writePng, cropPng } = require("./png");
const { createNativeOcrGlyphIcon } = require("./ocr-glyph-native-components");
const { hasTallPunctuationGraphicInk } = require("./ocr-punctuation-graphic-evidence");
const { framedGraphicEvidence } = require("./ocr-framed-graphic-evidence");
const { admitOcrGraphicEvidence } = require("./ocr-graphic-evidence-admission");
const { vectorizeVerifiedLineArtIcon } = require("./sparse-icon-native-contours");
const { buildMinimumUnitCropEvidence } = require("./graphic-crop-policy");

const MAX_GLYPHS = 10_000;
const MAX_PIXELS = 40_000_000;
const MAX_ID_LENGTH = 512;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {unknown} value @param {string} label */
function parseSlideSize(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} slide size is invalid`);
  const width = value.widthPt ?? value.w;
  const height = value.heightPt ?? value.h;
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0 || width > 100_000 || height > 100_000) {
    throw new TypeError(`${label} slide size is invalid`);
  }
  return { width, height };
}

/** @param {unknown} value @param {string} label */
function parseBox(value, label) {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)
    || value.x < 0 || value.y < 0 || value.w <= 0 || value.h <= 0) throw new TypeError(`${label} box is invalid`);
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}

/** @param {unknown} value @param {string} label */
function parseId(value, label) {
  if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new TypeError(`${label} id is invalid`);
  }
  return value;
}

/** @param {unknown} page */
function parsePage(page) {
  if (!isRecord(page) || !Array.isArray(page.textBoxes) || !Array.isArray(page.images)
    || page.textBoxes.length > MAX_GLYPHS || page.images.length > MAX_GLYPHS
    || (page.shapes !== undefined && (!Array.isArray(page.shapes) || page.shapes.length > MAX_GLYPHS || !page.shapes.every(isRecord)))) {
    throw new TypeError("OCR glyph residual page is invalid");
  }
  const textBoxIds = new Set();
  const textBoxes = page.textBoxes.map((textBox) => {
    if (!isRecord(textBox)) throw new TypeError("OCR glyph residual page is invalid");
    const id = parseId(textBox.id, "OCR glyph residual text box");
    if (textBoxIds.has(id)) throw new TypeError("OCR glyph residual page contains duplicate text box ids");
    textBoxIds.add(id);
    return textBox;
  });
  return { textBoxes, images: page.images, shapes: Array.isArray(page.shapes) ? page.shapes.filter(isRecord) : [], textBoxIds };
}

/** @param {unknown} glyphs @param {{width: number, height: number}} slideSize */
function parseGlyphs(glyphs, slideSize) {
  if (!Array.isArray(glyphs) || glyphs.length > MAX_GLYPHS) throw new TypeError("OCR glyph residual glyphs are invalid");
  const ids = new Set();
  return glyphs.map((glyph) => {
    if (!isRecord(glyph)) throw new TypeError("OCR glyph residual glyph is invalid");
    const id = parseId(glyph.id, "OCR glyph residual glyph");
    if (ids.has(id)) throw new TypeError("OCR glyph residual glyph ids are invalid");
    const box = parseBox(glyph.box, "OCR glyph residual glyph");
    if (box.x + box.w > slideSize.width || box.y + box.h > slideSize.height) throw new RangeError("OCR glyph residual glyph box is outside the slide");
    ids.add(id);
    const text = typeof glyph.text === "string" && glyph.text.length <= 512 ? glyph.text : "";
    const graphicEvidence = isRecord(glyph.source) ? glyph.source.ocrGraphicEvidence : undefined;
    return { id, box, text, graphicEvidence };
  });
}

/** Preserve exact integer pixel edges across slide-unit round trips, without pixel-sized tolerance.
 * @param {number} value */
function snapIntegerEdge(value) {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 8 ? nearest : value;
}

/** @param {unknown} root */
function parseRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root) || !fs.statSync(root).isDirectory()) throw new TypeError("OCR glyph residual root is invalid");
  const realRoot = fs.realpathSync(root);
  const assetDirectory = path.resolve(realRoot, "assets");
  const relative = path.relative(realRoot, assetDirectory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new TypeError("OCR glyph residual asset directory is invalid");
  if (fs.existsSync(assetDirectory) && !isDescendant(realRoot, fs.realpathSync(assetDirectory))) {
    throw new TypeError("OCR glyph residual asset directory is invalid");
  }
  return { realRoot, assetDirectory };
}

/** @param {string} root @param {string} candidate */
function isDescendant(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** @param {{realRoot: string, assetDirectory: string}} assetRoot */
function ensureAssetDirectory(assetRoot) {
  fs.mkdirSync(assetRoot.assetDirectory, { recursive: true });
  if (!isDescendant(assetRoot.realRoot, fs.realpathSync(assetRoot.assetDirectory))) {
    throw new TypeError("OCR glyph residual asset directory is invalid");
  }
}

/** @param {unknown} sourceFile */
function parseSourceFile(sourceFile) {
  if (typeof sourceFile !== "string" || !path.isAbsolute(sourceFile) || !fs.statSync(sourceFile).isFile()) {
    throw new TypeError("OCR glyph residual source file is invalid");
  }
  return sourceFile;
}

/** @param {{x: number, y: number, w: number, h: number}} box @param {{width: number, height: number}} slideSize @param {{width: number, height: number}} image */
function pixelCrop(box, slideSize, image) {
  const left = Math.floor(snapIntegerEdge(box.x * image.width / slideSize.width));
  const top = Math.floor(snapIntegerEdge(box.y * image.height / slideSize.height));
  const right = Math.ceil(snapIntegerEdge((box.x + box.w) * image.width / slideSize.width));
  const bottom = Math.ceil(snapIntegerEdge((box.y + box.h) * image.height / slideSize.height));
  if (left < 0 || top < 0 || right > image.width || bottom > image.height || right <= left || bottom <= top) {
    throw new RangeError("OCR glyph residual crop is outside the source image");
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** @param {number} index @param {number} pageIndex */
function assetName(index, pageIndex) {
  return `deck-p${String(pageIndex + 1).padStart(2, "0")}-ocr-glyph-${String(index + 1).padStart(3, "0")}.png`;
}

/**
 * Replaces uncertain OCR text overlays with exact source-image crops.
 * @param {{page: unknown, slideSize: unknown, sourceFile: unknown, root: unknown, glyphs: unknown}} input
 * @returns {{restoredGlyphs: number}}
 */
function restoreOcrGlyphResiduals(input) {
  if (!isRecord(input)) throw new TypeError("OCR glyph residual request is invalid");
  const pageState = parsePage(input.page);
  const slideSize = parseSlideSize(input.slideSize, "OCR glyph residual");
  const glyphs = parseGlyphs(input.glyphs, slideSize);
  if (glyphs.length === 0) return Object.freeze({ restoredGlyphs: 0 });
  const sourceFile = parseSourceFile(input.sourceFile);
  const assetRoot = parseRoot(input.root);
  const page = /** @type {Record<string, unknown>} */ (input.page);
  const pageIndex = page.pageIndex === undefined ? 0 : page.pageIndex;
  if (typeof pageIndex !== "number" || !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 99) {
    throw new TypeError("OCR glyph residual page index is invalid");
  }

  const source = readPng(sourceFile, { maxPixels: MAX_PIXELS });
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1
    || source.width * source.height > MAX_PIXELS) throw new Error("OCR glyph residual source image is invalid");
  let totalCropPixels = 0;
  let remainingFrameScanPixels = 4_000_000;
  const nonTextIds = new Set([...pageState.images, ...pageState.shapes].filter(isRecord).map(item => item.id));
  const plans = glyphs.map((glyph, index) => {
    const originalCrop = pixelCrop(glyph.box, slideSize, source);
    const sourceGraphic = admitOcrGraphicEvidence(glyph.graphicEvidence, {
      sourceWidth: source.width, sourceHeight: source.height, candidatePixelBox: originalCrop
    });
    if (nonTextIds.has(glyph.id)) throw new TypeError("OCR glyph residual glyph ids are invalid");
    const padding = Math.ceil(Math.min(originalCrop.w, originalCrop.h) * 0.1);
    const framePixels = (originalCrop.w + padding * 2) * (originalCrop.h + padding * 2);
    const scanFrame = !sourceGraphic && Array.from(glyph.text.trim()).length === 1 && framePixels <= remainingFrameScanPixels;
    if (scanFrame) remainingFrameScanPixels -= framePixels;
    const frame = scanFrame ? framedGraphicEvidence(source, originalCrop) : null;
    const tallPunctuation = !sourceGraphic && !frame && hasTallPunctuationGraphicInk(source, glyph.text, originalCrop);
    // Layout may remove a pictorial OCR overlay before recovery. Missing identities
    // require positive source evidence; OCR text alone never authorizes restoration.
    if (!pageState.textBoxIds.has(glyph.id) && !sourceGraphic && !frame && !tallPunctuation) {
      throw new TypeError("OCR glyph residual glyph ids are invalid");
    }
    const crop = sourceGraphic?.tightenedPixelBox || frame?.pixelBox || originalCrop;
    totalCropPixels += crop.w * crop.h;
    if (!Number.isSafeInteger(totalCropPixels) || totalCropPixels > MAX_PIXELS) {
      throw new RangeError("OCR glyph residual crops exceed the processing boundary");
    }
    const name = assetName(index, pageIndex);
    const target = path.resolve(assetRoot.assetDirectory, name);
    if (path.dirname(target) !== assetRoot.assetDirectory || fs.existsSync(target)) throw new Error("OCR glyph residual target asset already exists");
    return { ...glyph, crop, name, target, index, framedGraphic: frame !== null, tallPunctuation, sourceGraphic };
  });

  const created = [];
  try {
    ensureAssetDirectory(assetRoot);
    /** @type {Record<string, unknown>[]} */ const nativeShapes = [];
    const rasterPlans = [];
    for (const plan of plans) {
      const cropped = cropPng(source, plan.crop);
      const id = `ocr-glyph-fallback-${createHash("sha256").update(plan.id).digest("hex").slice(0, 16)}`;
      const box = {
          x: plan.crop.x * slideSize.width / source.width,
          y: plan.crop.y * slideSize.height / source.height,
          w: plan.crop.w * slideSize.width / source.width,
          h: plan.crop.h * slideSize.height / source.height
        };
      const graphicShapes = cropped.width <= 512 && cropped.height <= 512
        && (plan.framedGraphic || plan.tallPunctuation)
        ? vectorizeVerifiedLineArtIcon({ image: cropped, box, idPrefix: id, source: {
          editable: true, nativeRebuild: true, detector: plan.framedGraphic ? "ocr-framed-graphic-native-contour" : "ocr-punctuation-graphic-native-contour",
          nativeComponentRole: "ocr-graphic-recovery", sourceTextBoxId: plan.id
        } }) : [];
      const native = plan.sourceGraphic ? null : graphicShapes.length ? { shapes: graphicShapes }
        : createNativeOcrGlyphIcon({ id, box, cropImage: cropped });
      if (native) {
        for (const shape of native.shapes) {
          if (!isRecord(shape)) throw new Error("OCR glyph residual generated shape is invalid");
          parseId(shape.id, "OCR glyph residual generated shape");
          nativeShapes.push({ ...shape, source: { ...(isRecord(shape.source) ? shape.source : {}), sourceTextBoxId: plan.id } });
        }
        continue;
      }
      rasterPlans.push({ ...plan, cropped });
    }
    for (const plan of rasterPlans) {
      const temporary = path.join(assetRoot.assetDirectory, `.${plan.name}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
      try {
        writePng(temporary, plan.cropped);
        fs.linkSync(temporary, plan.target);
        created.push(plan.target);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    }
    const restoredIds = new Set(plans.map(plan => plan.id));
    const retainedShapes = pageState.shapes.filter(shape => !isRecord(shape.source)
      || !["ocr-glyph-native-icon", "ocr-framed-graphic-native-contour", "ocr-punctuation-graphic-native-contour"].includes(String(shape.source.detector))
      || typeof shape.source.sourceTextBoxId !== "string" || !restoredIds.has(shape.source.sourceTextBoxId));
    const usedIds = new Set([...retainedShapes, ...pageState.images, ...pageState.textBoxes].filter(isRecord).map(item => item.id));
    for (const shape of nativeShapes) {
      if (usedIds.has(shape.id)) throw new Error("OCR glyph residual generated identity is ambiguous");
      usedIds.add(shape.id);
    }
    const nextTextBoxes = pageState.textBoxes.filter((textBox) => !restoredIds.has(parseId(textBox.id, "OCR glyph residual text box")));
    const nextImages = pageState.images.concat(rasterPlans.map((plan) => ({
      id: `ocr-glyph-fallback-${String(plan.index + 1).padStart(3, "0")}`,
      type: "fidelity-crop",
      assetPath: `assets/${plan.name}`,
      box: {
        x: plan.crop.x * slideSize.width / source.width,
        y: plan.crop.y * slideSize.height / source.height,
        w: plan.crop.w * slideSize.width / source.width,
        h: plan.crop.h * slideSize.height / source.height
      },
      source: plan.sourceGraphic ? {
        editable: false,
        ocrGlyphFallback: true,
        strategy: "source-evidenced-tight-pictorial-crop",
        detector: "ocr-source-geometry-pictorial-crop",
        expressionForm: "icon-or-illustration",
        protectedMinimumUnit: true,
        ...buildMinimumUnitCropEvidence({
          sourceWidth: source.width, sourceHeight: source.height,
          originalPixelBox: plan.sourceGraphic.candidatePixelBox,
          refinement: {
            box: { x: plan.crop.x - plan.sourceGraphic.candidatePixelBox.x,
              y: plan.crop.y - plan.sourceGraphic.candidatePixelBox.y, w: plan.crop.w, h: plan.crop.h },
            // This path keeps exact pixels and every significant component from
            // the measured union. It performs no neighbor-pixel erasure.
            removedNeighborPixels: 0,
            retainedDetailComponents: Math.max(0, plan.sourceGraphic.metrics.significantComponents - 1)
          }
        }),
        sourceGraphicEvidence: plan.sourceGraphic,
        nonEditableReason: "source geometry identifies an isolated pictorial unit; exact pixels are preserved as a tight movable crop"
      } : { editable: false, ocrGlyphFallback: true, strategy: "uncertain-ocr-source-crop" }
    })));
    page.textBoxes = nextTextBoxes;
    page.images = nextImages;
    page.shapes = retainedShapes.concat(nativeShapes);
    return Object.freeze({ restoredGlyphs: plans.length, nativeGlyphs: nativeShapes.length > 0 ? plans.length - rasterPlans.length : 0 });
  } catch (error) {
    const cleanupErrors = [];
    for (const file of created.reverse()) {
      try { fs.unlinkSync(file); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "OCR glyph residual publication failed and cleanup was incomplete", { cause: error });
    throw error;
  }
}

module.exports = { restoreOcrGlyphResiduals };
