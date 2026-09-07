// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readPng, writePng } = require("./png");
const { fitKnowledgeGraphGrayNodes } = require("./knowledge-graph-gray-node-fit");
const { cleanGrayBorderPixels } = require("./gray-border-pixels");

const MAX_LAYERS = 200;
const MAX_SHAPES = 10_000;
const MAX_PIXELS = 40_000_000;
const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_PATH_LENGTH = 1024;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {unknown} value @param {string} label */
function parseSlideSize(value, label) {
  if (!isRecord(value) || !isFiniteNumber(value.widthPt) || !isFiniteNumber(value.heightPt)
    || value.widthPt <= 0 || value.heightPt <= 0 || value.widthPt > 100_000 || value.heightPt > 100_000) {
    throw new TypeError(`${label} slide size is invalid`);
  }
  return { widthPt: value.widthPt, heightPt: value.heightPt };
}

/** @param {unknown} value @param {string} label */
function parseLayerBox(value, label) {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)
    || !isFiniteNumber(value.w) || !isFiniteNumber(value.h)
    || value.x < 0 || value.y < 0 || value.w <= 0 || value.h <= 0) {
    throw new TypeError(`${label} box is invalid`);
  }
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}

/** @param {unknown} page */
function parsePage(page) {
  if (!isRecord(page) || !Array.isArray(page.shapes) || !Array.isArray(page.images)
    || page.shapes.length > MAX_SHAPES || page.images.length > MAX_LAYERS) {
    throw new TypeError("gray border residual page is invalid");
  }
  for (const key of ["shapes", "images"]) {
    const descriptor = Object.getOwnPropertyDescriptor(page, key);
    if (!descriptor || !("value" in descriptor) || descriptor.writable !== true) {
      throw new TypeError(`gray border residual page ${key} must be a writable data property`);
    }
  }
  const pageIndex = page.pageIndex === undefined ? 0 : page.pageIndex;
  if (typeof pageIndex !== "number" || !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 9999) {
    throw new TypeError("gray border residual page index is invalid");
  }
  return { page, shapes: page.shapes, images: page.images, pageIndex };
}

/** @param {unknown} root */
function parseRoot(root) {
  if (typeof root !== "string" || root.length === 0 || root.length > MAX_PATH_LENGTH || root.includes("\0")
    || !path.isAbsolute(root) || path.win32.isAbsolute(root) !== path.isAbsolute(root)) {
    throw new TypeError("gray border residual root is invalid");
  }
  const state = fs.lstatSync(root);
  if (!state.isDirectory() || state.isSymbolicLink()) throw new TypeError("gray border residual root is invalid");
  const realRoot = fs.realpathSync(root);
  return { realRoot, assetDirectory: path.join(realRoot, "assets") };
}

/** @param {string} root @param {string} candidate */
function isDescendant(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** @param {unknown} value @param {{realRoot:string}} root @param {string} label */
function parseExistingFile(value, root, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH || value.includes("\0")
    || !path.isAbsolute(value) || path.win32.isAbsolute(value) !== path.isAbsolute(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  const lexical = path.resolve(value);
  if (!isDescendant(root.realRoot, lexical)) throw new TypeError(`${label} is outside the root`);
  const state = fs.lstatSync(lexical);
  if (!state.isFile() || state.isSymbolicLink() || state.size > MAX_FILE_BYTES) {
    throw new TypeError(`${label} is invalid`);
  }
  const realFile = fs.realpathSync(lexical);
  if (!isDescendant(root.realRoot, realFile)) throw new TypeError(`${label} is outside the root`);
  return realFile;
}

/** @param {unknown} value @param {{realRoot:string}} root @param {string} label */
function parseAssetPath(value, root, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH || value.includes("\0")
    || path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new TypeError(`${label} asset path is invalid`);
  }
  const candidate = path.resolve(root.realRoot, value);
  if (!isDescendant(root.realRoot, candidate)) throw new TypeError(`${label} asset path is outside the root`);
  return candidate;
}

/** @param {{realRoot:string,assetDirectory:string}} root */
function ensureAssetDirectory(root) {
  if (fs.existsSync(root.assetDirectory)) {
    const state = fs.lstatSync(root.assetDirectory);
    if (!state.isDirectory() || state.isSymbolicLink()) throw new TypeError("gray border residual asset directory is invalid");
  } else {
    fs.mkdirSync(root.assetDirectory, { recursive: true });
  }
  const realDirectory = fs.realpathSync(root.assetDirectory);
  if (!isDescendant(root.realRoot, realDirectory) || realDirectory !== root.assetDirectory) {
    throw new TypeError("gray border residual asset directory is invalid");
  }
}

/** @param {number} pageIndex @param {number} imageIndex */
function assetName(pageIndex, imageIndex) {
  return `deck-p${String(pageIndex + 1).padStart(2, "0")}-gray-border-${String(imageIndex + 1).padStart(3, "0")}.png`;
}

/** @param {unknown} image @param {number} index @param {{realRoot:string}} root @param {Set<string>} paths */
function parseLayer(image, index, root, paths) {
  if (!isRecord(image)) throw new TypeError("gray border residual image layer is invalid");
  if (isRecord(image.source) && image.source.ocrGlyphFallback === true) return null;
  const assetPath = parseAssetPath(image.assetPath, root, "gray border residual image layer");
  const file = parseExistingFile(assetPath, root, "gray border residual image layer");
  if (paths.has(file)) throw new TypeError("gray border residual image layers contain duplicate asset paths");
  paths.add(file);
  return { image, index, file, box: parseLayerBox(image.box, "gray border residual image layer") };
}

/** @param {unknown} requested */
function cancellationRequested(requested) {
  if (requested !== undefined && typeof requested !== "function") throw new TypeError("gray border residual cancellation callback is invalid");
  return /** @type {undefined|(()=>unknown)} */ (requested);
}

/** @param {undefined|(()=>unknown)} requested */
async function throwIfCancelled(requested) {
  if (await requested?.()) {
    const error = new Error("gray border residual operation was cancelled");
    error.name = "AbortError";
    throw error;
  }
}

/** @param {string} temporary @param {string} target @param {unknown} image @param {undefined|(()=>unknown)} requested */
async function publish(temporary, target, image, requested) {
  await throwIfCancelled(requested);
  if (fs.existsSync(target)) throw new Error("gray border residual target asset already exists");
  if (!isRecord(image) || typeof image.width !== "number" || typeof image.height !== "number"
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || !(image.rgba instanceof Uint8Array)) throw new TypeError("gray border residual output image is invalid");
  writePng(temporary, { width: image.width, height: image.height, rgba: Buffer.from(image.rgba) });
  await throwIfCancelled(requested);
  if (fs.existsSync(target)) throw new Error("gray border residual target asset already exists");
  fs.linkSync(temporary, target);
}

/** @param {unknown} error @param {unknown[]} cleanupErrors @returns {never} */
function throwWithCleanup(error, cleanupErrors) {
  if (cleanupErrors.length > 0) {
    throw new AggregateError([error, ...cleanupErrors], "gray border residual publication failed and cleanup was incomplete", { cause: error });
  }
  throw error;
}

/**
 * Fits source-backed gray nodes, then removes their source-owned gray borders from raster layers.
 * Page references change only after every replacement image has been atomically published.
 * @param {{page:unknown,slideSize:unknown,sourceFile:unknown,root:unknown,isCancellationRequested?:()=>unknown}} input
 * @returns {Promise<{acceptedNodes:number,changedLayers:number,changedPixels:number}>}
 */
async function refineGrayBorderResiduals(input) {
  if (!isRecord(input)) throw new TypeError("gray border residual request is invalid");
  const requested = cancellationRequested(input.isCancellationRequested);
  const pageState = parsePage(input.page);
  const slideSize = parseSlideSize(input.slideSize, "gray border residual");
  const root = parseRoot(input.root);
  await throwIfCancelled(requested);
  const sourceFile = parseExistingFile(input.sourceFile, root, "gray border residual source file");
  const source = readPng(sourceFile, { maxPixels: MAX_PIXELS, maxFileBytes: MAX_FILE_BYTES });
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1
    || source.width * source.height > MAX_PIXELS) throw new Error("gray border residual source image is invalid");
  await throwIfCancelled(requested);
  const fitted = fitKnowledgeGraphGrayNodes({ shapes: pageState.shapes, slideSize, image: source });
  const acceptedNodes = fitted.evidence.accepted;
  if (!Number.isSafeInteger(acceptedNodes) || acceptedNodes < 0 || acceptedNodes > MAX_LAYERS || !Array.isArray(fitted.shapes) || !Array.isArray(fitted.borders)) {
    throw new Error("gray border residual fit result is invalid");
  }
  if (acceptedNodes === 0) return Object.freeze({ acceptedNodes: 0, changedLayers: 0, changedPixels: 0 });

  const paths = new Set([sourceFile]);
  const layers = [];
  for (let index = 0; index < pageState.images.length; index += 1) {
    const layer = parseLayer(pageState.images[index], index, root, paths);
    if (layer) layers.push(layer);
  }
  /** @type {{layer: NonNullable<ReturnType<typeof parseLayer>>, image:{width:number,height:number,rgba:Uint8Array}, changedPixels:number, name:string,target:string}[]} */
  const plans = [];
  let totalPixels = 0;
  let changedPixels = 0;
  for (const layer of layers) {
    await throwIfCancelled(requested);
    if (!layer) continue;
    const layerImage = readPng(layer.file, { maxPixels: MAX_PIXELS, maxFileBytes: MAX_FILE_BYTES });
    const pixels = layerImage.width * layerImage.height;
    if (!Number.isSafeInteger(pixels) || pixels > MAX_PIXELS || totalPixels > MAX_PIXELS - pixels) {
      throw new RangeError("gray border residual layers exceed the processing boundary");
    }
    totalPixels += pixels;
    await throwIfCancelled(requested);
    const result = cleanGrayBorderPixels({ sourceImage: source, layerImage, layerBox: layer.box, slideSize, borders: fitted.borders });
    if (result.changedPixels > 0) {
      const name = assetName(pageState.pageIndex, layer.index);
      const target = path.resolve(root.assetDirectory, name);
      if (path.dirname(target) !== root.assetDirectory || fs.existsSync(target)) {
        throw new Error("gray border residual target asset already exists");
      }
      plans.push({ layer, image: result.image, changedPixels: result.changedPixels, name, target });
      changedPixels += result.changedPixels;
    }
  }

  const created = [];
  try {
    if (plans.length > 0) ensureAssetDirectory(root);
    for (const plan of plans) {
      await throwIfCancelled(requested);
      const temporary = path.join(root.assetDirectory, `.${plan.name}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
      try {
        await publish(temporary, plan.target, plan.image, requested);
        created.push(plan.target);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
    }
    await throwIfCancelled(requested);
    const replacements = new Map(plans.map((plan) => [plan.layer.index, `assets/${plan.name}`]));
    const nextImages = pageState.images.map((image, index) => {
      const assetPath = replacements.get(index);
      if (!assetPath) return image;
      const next = { ...image, assetPath };
      if (isRecord(image.style) && Object.prototype.hasOwnProperty.call(image.style, "assetPath")) {
        next.style = { ...image.style, assetPath };
      }
      return next;
    });
    pageState.page.shapes = fitted.shapes;
    pageState.page.images = nextImages;
    return Object.freeze({ acceptedNodes, changedLayers: plans.length, changedPixels });
  } catch (error) {
    /** @type {unknown[]} */ const cleanupErrors = [];
    for (const file of created.reverse()) {
      try { fs.unlinkSync(file); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    throwWithCleanup(error, cleanupErrors);
  }
}

module.exports = { refineGrayBorderResiduals };
