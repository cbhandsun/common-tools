// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readPng, writePng, cropPng } = require("./png");

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
    || page.textBoxes.length > MAX_GLYPHS || page.images.length > MAX_GLYPHS) {
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
  return { textBoxes, images: page.images, textBoxIds };
}

/** @param {unknown} glyphs @param {Set<string>} textBoxIds @param {{width: number, height: number}} slideSize */
function parseGlyphs(glyphs, textBoxIds, slideSize) {
  if (!Array.isArray(glyphs) || glyphs.length > MAX_GLYPHS) throw new TypeError("OCR glyph residual glyphs are invalid");
  const ids = new Set();
  return glyphs.map((glyph) => {
    if (!isRecord(glyph)) throw new TypeError("OCR glyph residual glyph is invalid");
    const id = parseId(glyph.id, "OCR glyph residual glyph");
    if (ids.has(id) || !textBoxIds.has(id)) throw new TypeError("OCR glyph residual glyph ids are invalid");
    const box = parseBox(glyph.box, "OCR glyph residual glyph");
    if (box.x + box.w > slideSize.width || box.y + box.h > slideSize.height) throw new RangeError("OCR glyph residual glyph box is outside the slide");
    ids.add(id);
    return { id, box };
  });
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
  const left = Math.floor(box.x * image.width / slideSize.width);
  const top = Math.floor(box.y * image.height / slideSize.height);
  const right = Math.ceil((box.x + box.w) * image.width / slideSize.width);
  const bottom = Math.ceil((box.y + box.h) * image.height / slideSize.height);
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
  const glyphs = parseGlyphs(input.glyphs, pageState.textBoxIds, slideSize);
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
  const plans = glyphs.map((glyph, index) => {
    const crop = pixelCrop(glyph.box, slideSize, source);
    totalCropPixels += crop.w * crop.h;
    if (!Number.isSafeInteger(totalCropPixels) || totalCropPixels > MAX_PIXELS) {
      throw new RangeError("OCR glyph residual crops exceed the processing boundary");
    }
    const name = assetName(index, pageIndex);
    const target = path.resolve(assetRoot.assetDirectory, name);
    if (path.dirname(target) !== assetRoot.assetDirectory || fs.existsSync(target)) throw new Error("OCR glyph residual target asset already exists");
    return { ...glyph, crop, name, target };
  });

  const created = [];
  try {
    ensureAssetDirectory(assetRoot);
    for (const plan of plans) {
      const temporary = path.join(assetRoot.assetDirectory, `.${plan.name}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
      try {
        writePng(temporary, cropPng(source, plan.crop));
        fs.linkSync(temporary, plan.target);
        created.push(plan.target);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    }
    const restoredIds = new Set(plans.map(plan => plan.id));
    const nextTextBoxes = pageState.textBoxes.filter((textBox) => !restoredIds.has(parseId(textBox.id, "OCR glyph residual text box")));
    const nextImages = pageState.images.concat(plans.map((plan, index) => ({
      id: `ocr-glyph-fallback-${String(index + 1).padStart(3, "0")}`,
      type: "fidelity-crop",
      assetPath: `assets/${plan.name}`,
      box: {
        x: plan.crop.x * slideSize.width / source.width,
        y: plan.crop.y * slideSize.height / source.height,
        w: plan.crop.w * slideSize.width / source.width,
        h: plan.crop.h * slideSize.height / source.height
      },
      source: { editable: false, ocrGlyphFallback: true, strategy: "uncertain-ocr-source-crop" }
    })));
    page.textBoxes = nextTextBoxes;
    page.images = nextImages;
    return Object.freeze({ restoredGlyphs: plans.length });
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
