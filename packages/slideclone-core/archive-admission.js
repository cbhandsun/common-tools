// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {validateDeckIr} = require("./deck-ir-admission");
const MAX_DECK_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tiff"]);
const RAW_IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png"]);
const MAX_RAW_IMAGE_DIMENSION = 16384;
const MAX_RAW_IMAGE_PIXELS = 40000000;
const MAX_RAW_IMAGE_PAGES = 20;
const MAX_RAW_IMAGE_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_RAW_IMAGE_TOTAL_PIXELS = 200000000;

/** The document inspector is supplied at the Worker composition root.
 * @param {(file: string) => {kind: string, extension: string, pages: number | null}} assertEditableInputDocument */
function createArchiveAdmission(assertEditableInputDocument) {
  if (typeof assertEditableInputDocument !== "function") throw new TypeError("document inspector is required");
/** @param {string} root */
function validatePackage(root) {
  const deckFile = path.join(root, "deck.json");
  if (!fs.existsSync(deckFile)) return validateRawImagePackage(root);
  if (!fs.statSync(deckFile).isFile() || fs.statSync(deckFile).size > MAX_DECK_BYTES) throw new Error("editable archive must contain a bounded deck.json at its root");
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    if (directory === undefined) throw new Error("editable archive directory queue is invalid");
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) { if (relative !== "assets" && !relative.startsWith("assets/")) throw new Error("editable archive contains an unsupported directory"); queue.push(absolute); continue; }
      if (!entry.isFile() || (relative !== "deck.json" && !relative.startsWith("assets/"))) throw new Error("editable archive contains an unsupported file");
      if (relative !== "deck.json" && (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || fs.statSync(absolute).size > MAX_ASSET_BYTES)) throw new Error("editable archive contains an invalid image asset");
    }
  }
  /** @type {unknown} */ let ir;
  try { ir = JSON.parse(fs.readFileSync(deckFile, "utf8")); }
  catch { throw new Error("editable deck.json is invalid JSON"); }
  const validated = validateDeckIr(ir, root);
  const { resolveStructuredSourceImages } = require("./structured-source-images");
  return { kind: /** @type {const} */ ("deck-ir"), deckFile, ...validated, structuredDeck: ir, structuredSourceImages: resolveStructuredSourceImages(ir, root) };
}
/** @param {string} root */
function validateRawImagePackage(root) {
  const documentFiles = ["source.pdf", "source.pptx"].map((name) => path.join(root, "assets", name)).filter((file) => fs.existsSync(file));
  if (documentFiles.length > 0) return validateDocumentPackage(root, documentFiles);
  const files = [];
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    if (directory === undefined) throw new Error("editable archive directory queue is invalid");
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (relative !== "assets" && !/^assets\/source(?:-\d{3})?\.(?:png|jpe?g)$/u.test(relative)) throw new Error("raw editable archive contains an unsupported entry");
      if (entry.isDirectory()) { if (relative !== "assets") throw new Error("raw editable archive contains an unsupported directory"); queue.push(absolute); continue; }
      if (!entry.isFile()) throw new Error("raw editable archive contains an unsupported file");
      files.push({ file: absolute, relative, extension: path.extname(entry.name).toLowerCase(), bytes: fs.statSync(absolute).size });
    }
  }
  files.sort((left, right) => left.relative.localeCompare(right.relative, "en"));
  const single = files.length === 1 && /^assets\/source\.(?:png|jpe?g)$/u.test(files[0]?.relative || "");
  const batchNames = files.every((item, index) => item.relative === `assets/source-${String(index + 1).padStart(3, "0")}${item.extension}`);
  const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  if (files.length < 1 || files.length > MAX_RAW_IMAGE_PAGES || (!single && !batchNames) || !Number.isSafeInteger(totalBytes) || totalBytes > MAX_RAW_IMAGE_TOTAL_BYTES || files.some((item) => !RAW_IMAGE_EXTENSIONS.has(item.extension) || item.bytes < 1 || item.bytes > MAX_ASSET_BYTES)) {
    throw new Error("raw editable archive requires one to twenty bounded, contiguously ordered PNG or JPEG source images");
  }
  let totalPixels = 0;
  const sources = files.map((item, index) => {
    const dimensions = readRawImageDimensions(item.file, item.extension);
    const pixels = dimensions.widthPx * dimensions.heightPx;
    totalPixels += pixels;
    if (dimensions.widthPx > MAX_RAW_IMAGE_DIMENSION || dimensions.heightPx > MAX_RAW_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_RAW_IMAGE_PIXELS) throw new Error("raw editable image dimensions exceed worker limits");
    return Object.freeze({ inputFile: item.file, assetPath: item.relative, dimensions, pageIndex: index });
  });
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_RAW_IMAGE_TOTAL_PIXELS) {
    throw new Error("raw editable image pixels exceed the batch limit");
  }
  const first = sources[0];
  if (!first) throw new Error("raw editable archive requires a source image");
  return { kind: /** @type {const} */ ("raw-image"), sources, inputFile: first.inputFile, assetPath: first.assetPath, dimensions: first.dimensions, pages: sources.length, assets: sources.length };
}
/** @param {string} root @param {string[]} documentFiles */
function validateDocumentPackage(root, documentFiles) {
  const assets = path.join(root, "assets");
  const rootEntries = fs.readdirSync(root, { withFileTypes: true });
  const assetEntries = fs.existsSync(assets) ? fs.readdirSync(assets, { withFileTypes: true }) : [];
  if (documentFiles.length !== 1 || rootEntries.length !== 1 || rootEntries[0]?.name !== "assets" || !rootEntries[0]?.isDirectory() || assetEntries.length !== 1 || !assetEntries[0]?.isFile()) throw new Error("document editable archive requires exactly one assets/source.pdf or assets/source.pptx file");
  const inputFile = documentFiles[0];
  if (!inputFile) throw new Error("document editable archive requires a source file");
  const admitted = assertEditableInputDocument(inputFile);
  return { kind: /** @type {const} */ ("raw-document"), documentKind: admitted.kind, inputFile, assetPath: `assets/source${admitted.extension}`, pages: admitted.pages, assets: 1 };
}

return { validatePackage, validateDocumentPackage, readRawImageDimensions };
}
/** @param {string} file @param {string} extension */
function readRawImageDimensions(file, extension) {
  const buffer = fs.readFileSync(file);
  if (extension === ".png") {
    if (buffer.length < 33 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || buffer.toString("ascii", buffer.length - 8, buffer.length - 4) !== "IEND") throw new Error("raw editable PNG is incomplete");
    const widthPx = buffer.readUInt32BE(16); const heightPx = buffer.readUInt32BE(20);
    if (!widthPx || !heightPx) throw new Error("raw editable PNG dimensions are invalid");
    return { widthPx, heightPx };
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) throw new Error("raw editable JPEG is incomplete");
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset++];
    if (marker === undefined) break;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 1 >= buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) {
      const heightPx = buffer.readUInt16BE(offset + 3); const widthPx = buffer.readUInt16BE(offset + 5);
      if (!widthPx || !heightPx) throw new Error("raw editable JPEG dimensions are invalid");
      return { widthPx, heightPx };
    }
    offset += length;
  }
  throw new Error("raw editable JPEG dimensions are invalid");
}

module.exports = { readRawImageDimensions, createArchiveAdmission, IMAGE_EXTENSIONS, MAX_DECK_BYTES, MAX_RAW_IMAGE_PAGES };
