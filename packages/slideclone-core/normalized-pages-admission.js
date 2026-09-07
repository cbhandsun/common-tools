// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {validateDeckIrTree} = require("./deck-ir-tree");
const {readRawImageDimensions} = require("./archive-admission");

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("document normalization returned an invalid page set");
  return /** @type {Record<string, unknown>} */ (value);
}

/** Validate inert metadata and actual local images before OCR or page copying.
 * @param {unknown} value @param {string} root */
function admitNormalizedPages(value, root) {
  validateDeckIrTree(value);
  const result = record(value);
  if (!Array.isArray(result.sources) || result.sources.length < 1 || result.sources.length > 20
    || result.pages !== result.sources.length || result.assets !== result.sources.length) throw new TypeError("document normalization returned an invalid page set");
  const assets = path.join(root, "assets");
  const directory = fs.lstatSync(assets);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("normalized document assets directory is invalid");
  let totalBytes = 0, totalPixels = 0;
  const sources = (/** @type {unknown[]} */ (result.sources)).map((value, pageIndex) => {
    const source = record(value), dimensions = record(source.dimensions);
    const assetPath = `assets/source-${String(pageIndex + 1).padStart(3,"0")}.png`;
    const inputFile = path.join(root, "assets", path.posix.basename(assetPath));
    if (source.pageIndex !== pageIndex || source.assetPath !== assetPath || source.inputFile !== inputFile) throw new TypeError("normalized document page path or order is invalid");
    const info = fs.lstatSync(inputFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 60 * 1024 * 1024) throw new Error("normalized document image is invalid");
    const actual = readRawImageDimensions(inputFile, ".png");
    const pixels = actual.widthPx * actual.heightPx;
    if (dimensions.widthPx !== actual.widthPx || dimensions.heightPx !== actual.heightPx || !Number.isSafeInteger(pixels) || pixels > 40000000) throw new Error("normalized document dimensions are invalid");
    totalBytes += info.size; totalPixels += pixels;
    if (totalBytes > 60 * 1024 * 1024 || totalPixels > 200000000) throw new Error("normalized document pages exceed the batch processing limit");
    return Object.freeze({inputFile, assetPath, dimensions:Object.freeze(actual), pageIndex});
  });
  return Object.freeze({sources:Object.freeze(sources), pages:sources.length, assets:sources.length});
}
module.exports = {admitNormalizedPages};
