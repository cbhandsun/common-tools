"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { safeAssetPath } = require("./deck-ir-admission");
const { readRawImageDimensions } = require("./archive-admission");

const MAX_SOURCE_IMAGES = 20;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_IMAGE_DIMENSION = 16384;
const MAX_SOURCE_IMAGE_PIXELS = 40_000_000;
const MAX_SOURCE_IMAGE_TOTAL_PIXELS = 200_000_000;

/** @param {string} root @param {string} file */
function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
/** @param {string} asset */
function sourceImageExtension(asset) {
  const extension = path.posix.extname(asset).toLowerCase();
  if (extension !== ".png" && extension !== ".jpg" && extension !== ".jpeg") throw new Error("structured source image must be a PNG or JPEG asset");
  return extension;
}
/** @param {string} root @param {string} file */
function assertNoSymlinkPath(root, file) {
  let current = root;
  for (const segment of path.relative(root, file).split(path.sep)) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("structured source image asset must not use symbolic links");
  }
}

/** Resolve one admitted page-image asset for every structured Deck IR page.
 *
 * A legacy Deck IR that supplies no page-image evidence returns null. A deck
 * which supplies evidence for only some pages is rejected, because the render
 * comparator requires a source image for every rendered page.
 * @param {unknown} deck
 * @param {unknown} root
 * @returns {readonly string[] | null}
 */
function resolveStructuredSourceImages(deck, root) {
  if (!deck || typeof deck !== "object" || Array.isArray(deck) || !("pages" in deck) || !Array.isArray(deck.pages)) throw new TypeError("structured source image deck is invalid");
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("structured source image root is invalid");
  if (deck.pages.length < 1) throw new Error("structured source image deck has an invalid page count");
  const realRoot = fs.realpathSync(root);
  let totalPixels = 0;
  const pages = /** @type {unknown[]} */ (deck.pages);
  const sources = pages.map((page, pageIndex) => {
    const source = page && typeof page === "object" && !Array.isArray(page) && "source" in page ? page.source : undefined;
    if (source == null) return null;
    if (typeof source !== "object" || Array.isArray(source)) throw new Error(`structured deck page ${pageIndex + 1} has an invalid source.pageImage`);
    if (!("pageImage" in source)) return null;
    const asset = safeAssetPath(source.pageImage);
    const extension = sourceImageExtension(asset);
    const file = path.resolve(root, ...asset.split("/"));
    if (!insideRoot(root, file) || !fs.existsSync(file)) throw new Error("structured source image asset is missing");
    assertNoSymlinkPath(root, file);
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.size < 1 || info.size > MAX_SOURCE_IMAGE_BYTES || !insideRoot(realRoot, fs.realpathSync(file))) throw new Error("structured source image asset is invalid");
    const dimensions = readRawImageDimensions(file, extension);
    const pixels = dimensions.widthPx * dimensions.heightPx;
    if (dimensions.widthPx > MAX_SOURCE_IMAGE_DIMENSION || dimensions.heightPx > MAX_SOURCE_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_SOURCE_IMAGE_PIXELS) throw new Error("structured source image dimensions exceed worker limits");
    totalPixels += pixels;
    return file;
  });
  const declaredPages = sources.filter((source) => source !== null);
  if (declaredPages.length === 0) return null;
  if (sources.length > MAX_SOURCE_IMAGES) throw new Error("structured source image deck has an invalid page count");
  if (declaredPages.length !== sources.length) throw new Error("structured deck source.pageImage must be declared for every page");
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_SOURCE_IMAGE_TOTAL_PIXELS) throw new Error("structured source image pixels exceed the batch limit");
  return Object.freeze(/** @type {string[]} */ (sources));
}

module.exports = { MAX_SOURCE_IMAGES, resolveStructuredSourceImages };
