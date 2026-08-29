"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readRawImageDimensions } = require("./team-worker");
const { EDITABLE_DOCUMENT_EXTENSIONS, assertEditableInputDocument } = require("./document-input");

const MAX_RAW_IMAGE_ARCHIVE_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_RAW_IMAGE_ARCHIVE_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_RAW_IMAGE_ARCHIVE_PAGES = 20;
const MAX_RAW_IMAGE_DIMENSION = 16384;
const MAX_RAW_IMAGE_PIXELS = 40000000;
const RAW_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function tarField(buffer, offset, length, value) { buffer.write(value.slice(0, length), offset, length, "utf8"); }
function tarEntry(name, body) {
  const header = Buffer.alloc(512);
  tarField(header, 0, 100, name);
  tarField(header, 100, 8, "0000600\0");
  tarField(header, 108, 8, "0000000\0");
  tarField(header, 116, 8, "0000000\0");
  tarField(header, 124, 12, `${body.length.toString(8).padStart(11, "0")}\0`);
  tarField(header, 136, 12, "00000000000\0");
  tarField(header, 148, 8, "        ");
  tarField(header, 156, 1, "0");
  tarField(header, 257, 6, "ustar\0");
  tarField(header, 263, 2, "00");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  tarField(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}
function assertRegularInput(inputFile) {
  if (typeof inputFile !== "string" || !path.isAbsolute(inputFile)) throw new TypeError("raw image archive input must be an absolute path");
  let stat;
  try { stat = fs.lstatSync(inputFile); } catch { throw new Error("raw image archive input is unavailable"); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_RAW_IMAGE_ARCHIVE_INPUT_BYTES) throw new Error("raw image archive input is invalid");
  const extension = path.extname(inputFile).toLowerCase();
  if (!RAW_IMAGE_EXTENSIONS.has(extension)) throw new Error("raw image archive input must be a PNG or JPEG");
  return { extension, bytes: stat.size };
}
function assertNewOutput(outputFile) {
  if (typeof outputFile !== "string" || !path.isAbsolute(outputFile) || path.extname(outputFile).toLowerCase() !== ".gz") throw new TypeError("raw image archive output must be an absolute .gz path");
  if (fs.existsSync(outputFile)) throw new Error("raw image archive output already exists");
  const parent = path.dirname(outputFile);
  let parentStat;
  try { parentStat = fs.lstatSync(parent); } catch { throw new Error("raw image archive output directory is unavailable"); }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error("raw image archive output directory is invalid");
}
function createRawImageArchive({ inputFile, inputFiles, outputFile }) {
  const files = inputFiles === undefined ? [inputFile] : inputFiles;
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_RAW_IMAGE_ARCHIVE_PAGES || files.some((file) => typeof file !== "string") || new Set(files).size !== files.length) throw new TypeError("raw image archive inputs must contain one to twenty unique files");
  const inputs = files.map((file) => ({ file, ...assertRegularInput(file) }));
  const totalBytes = inputs.reduce((sum, input) => sum + input.bytes, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_RAW_IMAGE_ARCHIVE_TOTAL_BYTES) throw new Error("raw image archive inputs exceed the total byte limit");
  assertNewOutput(outputFile);
  const sources = inputs.map((input, index) => {
    const dimensions = readRawImageDimensions(input.file, input.extension);
    const pixels = dimensions.widthPx * dimensions.heightPx;
    if (dimensions.widthPx > MAX_RAW_IMAGE_DIMENSION || dimensions.heightPx > MAX_RAW_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_RAW_IMAGE_PIXELS) throw new Error("raw image archive input dimensions exceed team limits");
    const suffix = inputs.length === 1 ? "" : `-${String(index + 1).padStart(3, "0")}`;
    const extension = input.extension === ".png" ? ".png" : input.extension === ".jpg" ? ".jpg" : ".jpeg";
    return Object.freeze({ file: input.file, assetPath: `assets/source${suffix}${extension}`, bytes: input.bytes, widthPx: dimensions.widthPx, heightPx: dimensions.heightPx });
  });
  const archive = require("node:zlib").gzipSync(Buffer.concat([...sources.map((source) => tarEntry(source.assetPath, fs.readFileSync(source.file))), Buffer.alloc(1024)]), { level: 9 });
  const temporary = `${outputFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, archive, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, outputFile);
  } catch (error) { try { fs.rmSync(temporary, { force: true }); } catch { /* Preserve the primary archive creation failure. */ } throw error; }
  const sourceDetails = sources.map(({ assetPath, bytes, widthPx, heightPx }) => Object.freeze({ assetPath, bytes, widthPx, heightPx }));
  return Object.freeze({ archive: outputFile, contentType: "application/gzip", contentLength: archive.length, sha256: sha256(archive), pages: sources.length, sources: Object.freeze(sourceDetails), ...(sources.length === 1 ? { source: sourceDetails[0] } : {}) });
}

function createEditableSourceArchive({ inputFile, inputFiles, outputFile }) {
  if (inputFiles !== undefined || !EDITABLE_DOCUMENT_EXTENSIONS.has(path.extname(String(inputFile || "")).toLowerCase())) return createRawImageArchive({ inputFile, inputFiles, outputFile });
  if (typeof inputFile !== "string" || !path.isAbsolute(inputFile)) throw new TypeError("editable source archive input must be an absolute path");
  const admitted = assertEditableInputDocument(inputFile);
  assertNewOutput(outputFile);
  const assetPath = `assets/source${admitted.extension}`;
  const archive = require("node:zlib").gzipSync(Buffer.concat([tarEntry(assetPath, fs.readFileSync(inputFile)), Buffer.alloc(1024)]), { level: 9 });
  const temporary = `${outputFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, archive, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, outputFile);
  } catch (error) { try { fs.rmSync(temporary, { force: true }); } catch { /* Preserve the primary archive creation failure. */ } throw error; }
  return Object.freeze({ archive: outputFile, contentType: "application/gzip", contentLength: archive.length, sha256: sha256(archive), pages: admitted.pages, source: Object.freeze({ assetPath, bytes: admitted.bytes, kind: admitted.kind }) });
}

module.exports = { MAX_RAW_IMAGE_ARCHIVE_INPUT_BYTES, MAX_RAW_IMAGE_ARCHIVE_PAGES, MAX_RAW_IMAGE_ARCHIVE_TOTAL_BYTES, RAW_IMAGE_EXTENSIONS, createEditableSourceArchive, createRawImageArchive, tarEntry };
