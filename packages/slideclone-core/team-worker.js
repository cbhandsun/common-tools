"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAX_ARCHIVE_BYTES, extractProjectArchive } = require("../project-audit-core/team-worker");
const { assertQualityReport } = require("../capability-contracts");

const MAX_DECK_BYTES = 1024 * 1024;
const MAX_PAGES = 50;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_PPTX_BYTES = 100 * 1024 * 1024;
const MAX_IR_DEPTH = 16;
const MAX_IR_NODES = 30000;
const IMAGE_EXTENSIONS = new Set([".bmp", ".gif", ".jpeg", ".jpg", ".png", ".tiff"]);
const RAW_IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png"]);
const MAX_RAW_IMAGE_DIMENSION = 16384;
const MAX_RAW_IMAGE_PIXELS = 40000000;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}
function safeAssetPath(value) {
  if (typeof value !== "string" || !value || value.length > 512 || value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)) throw new Error("editable deck references an unsafe asset path");
  const normalized = path.posix.normalize(value);
  if (!normalized.startsWith("assets/") || normalized === "assets" || normalized.includes("../")) throw new Error("editable deck asset must be inside assets/");
  return normalized;
}
function validateTree(value, depth = 0, counter = { nodes: 0 }) {
  counter.nodes += 1;
  if (counter.nodes > MAX_IR_NODES || depth > MAX_IR_DEPTH) throw new Error("editable deck structure exceeds safe limits");
  if (typeof value === "string") { if (value.length > 32768 || value.includes("\0")) throw new Error("editable deck contains an invalid string"); return; }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value) || Math.abs(value) > 100000) throw new Error("editable deck contains an invalid number"); return; }
  if (Array.isArray(value)) { for (const item of value) validateTree(item, depth + 1, counter); return; }
  if (!value || typeof value !== "object") throw new Error("editable deck contains an invalid value");
  for (const [key, item] of Object.entries(value)) {
    if (key.length > 128 || key.includes("\0")) throw new Error("editable deck contains an invalid property");
    validateTree(item, depth + 1, counter);
  }
}
function validateDeckIr(ir, root) {
  if (!ir || typeof ir !== "object" || Array.isArray(ir) || ir.version !== "1.0" || !ir.slideSize || !Array.isArray(ir.pages) || ir.pages.length < 1 || ir.pages.length > MAX_PAGES) throw new Error("editable input requires a bounded deck.json IR");
  const { widthPt, heightPt } = ir.slideSize;
  if (![widthPt, heightPt].every((value) => Number.isFinite(value) && value >= 72 && value <= 4000)) throw new Error("editable deck slideSize is invalid");
  validateTree(ir);
  const referencedAssets = new Set();
  function visit(value, parentKey = "") {
    if (Array.isArray(value)) { for (const item of value) visit(item, ""); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if ((key === "assetPath" || (key === "pageImage" && parentKey === "source")) && item != null) referencedAssets.add(safeAssetPath(item));
      visit(item, key);
    }
  }
  visit(ir);
  for (const asset of referencedAssets) {
    const file = path.resolve(root, ...asset.split("/"));
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("editable deck references a missing asset");
  }
  return { pages: ir.pages.length, assets: referencedAssets.size };
}
function validatePackage(root) {
  const deckFile = path.join(root, "deck.json");
  if (!fs.existsSync(deckFile)) return validateRawImagePackage(root);
  if (!fs.statSync(deckFile).isFile() || fs.statSync(deckFile).size > MAX_DECK_BYTES) throw new Error("editable archive must contain a bounded deck.json at its root");
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) { if (relative !== "assets" && !relative.startsWith("assets/")) throw new Error("editable archive contains an unsupported directory"); queue.push(absolute); continue; }
      if (!entry.isFile() || (relative !== "deck.json" && !relative.startsWith("assets/"))) throw new Error("editable archive contains an unsupported file");
      if (relative !== "deck.json" && (!IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) || fs.statSync(absolute).size > MAX_ASSET_BYTES)) throw new Error("editable archive contains an invalid image asset");
    }
  }
  let ir;
  try { ir = JSON.parse(fs.readFileSync(deckFile, "utf8")); }
  catch { throw new Error("editable deck.json is invalid JSON"); }
  return { kind: "deck-ir", deckFile, ...validateDeckIr(ir, root) };
}
function validateRawImagePackage(root) {
  const expected = new Set(["assets", "assets/source.png", "assets/source.jpg", "assets/source.jpeg"]);
  const files = [];
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (!expected.has(relative)) throw new Error("raw editable archive contains an unsupported entry");
      if (entry.isDirectory()) { if (relative !== "assets") throw new Error("raw editable archive contains an unsupported directory"); queue.push(absolute); continue; }
      if (!entry.isFile() || !relative.startsWith("assets/source.")) throw new Error("raw editable archive contains an unsupported file");
      files.push({ file: absolute, relative, extension: path.extname(entry.name).toLowerCase(), bytes: fs.statSync(absolute).size });
    }
  }
  if (files.length !== 1 || !RAW_IMAGE_EXTENSIONS.has(files[0].extension) || files[0].bytes < 1 || files[0].bytes > MAX_ASSET_BYTES) {
    throw new Error("raw editable archive requires exactly one bounded PNG or JPEG source image");
  }
  const dimensions = readRawImageDimensions(files[0].file, files[0].extension);
  const pixels = dimensions.widthPx * dimensions.heightPx;
  if (dimensions.widthPx > MAX_RAW_IMAGE_DIMENSION || dimensions.heightPx > MAX_RAW_IMAGE_DIMENSION || !Number.isSafeInteger(pixels) || pixels > MAX_RAW_IMAGE_PIXELS) {
    throw new Error("raw editable image dimensions exceed worker limits");
  }
  return { kind: "raw-image", inputFile: files[0].file, assetPath: files[0].relative, dimensions, pages: 1, assets: 1 };
}
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
function rawImageDeck(metadata, ocr) {
  const items = Array.isArray(ocr?.lines) ? ocr.lines : [];
  if (items.length > 10000) throw new Error("raw editable OCR result exceeds limits");
  const widthPt = 960;
  const heightPt = Math.max(72, Math.min(4000, Math.round(widthPt * metadata.dimensions.heightPx / metadata.dimensions.widthPx)));
  const scaleX = widthPt / metadata.dimensions.widthPx; const scaleY = heightPt / metadata.dimensions.heightPx;
  const textBoxes = items.map((line, index) => {
    if (!line || typeof line.text !== "string" || !line.text.trim() || !line.box || !["x", "y", "w", "h"].every((key) => Number.isFinite(line.box[key]))) throw new Error("raw editable OCR result is invalid");
    const box = { x: line.box.x * scaleX, y: line.box.y * scaleY, w: line.box.w * scaleX, h: line.box.h * scaleY };
    if (box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0 || box.x + box.w > widthPt || box.y + box.h > heightPt) throw new Error("raw editable OCR box is invalid");
    return { id: `ocr-${index + 1}`, role: "body", text: line.text.trim(), box, font: { family: "Arial", sizePt: Math.max(6, Math.min(36, box.h * 0.72)), color: "#111111", opacity: 0 }, style: { visibility: "hidden", opacity: 0 }, source: { ocrProvider: "team-pinned-ocr", editable: true, overlayVisibility: "hidden" } };
  });
  return { version: "1.0", slideSize: { widthPt, heightPt }, pages: [{ pageIndex: 0, background: { fill: "#FFFFFF" }, textBoxes, shapes: [], images: [{ id: "source-background", type: "source-background", box: { x: 0, y: 0, w: widthPt, h: heightPt }, assetPath: metadata.assetPath, style: { opacity: 1, assetPath: metadata.assetPath, strategy: "full-slide-underlay" }, source: { editable: false, nonEditableReason: "Full-slide underlay preserves visual fidelity while OCR text is rebuilt as hidden editable overlay text." } }], tables: [], charts: [], icons: [] }] };
}
function runBuilder({ executable, builderArgs = [], deckFile, outputFile, cwd, timeoutMs }) {
  if (typeof executable !== "string" || !path.isAbsolute(executable)) throw new Error("OpenXML builder executable is invalid");
  if (!Array.isArray(builderArgs) || builderArgs.some((arg) => typeof arg !== "string" || !arg)) throw new TypeError("OpenXML builder arguments are invalid");
  return new Promise((resolve, reject) => {
    childProcess.execFile(executable, [...builderArgs, "--ir", deckFile, "--out", outputFile, "--powerpoint-safe", "true"], { cwd, windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error) => error ? reject(error) : resolve());
  });
}
function createImageToEditableArchiveHandler({ objectStore, temporaryRoot = os.tmpdir(), builderExecutable = process.env.OPENXML_BUILDER_EXE || "/opt/openxml/OpenXmlDeckBuilder", builderArgs = [], rawImageOcr, timeoutMs = 8 * 60 * 1000 } = {}) {
  const store = assertObjectStore(objectStore);
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 9 * 60 * 1000) throw new RangeError("editable worker timeout is invalid");
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "image-to-editable" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("editable worker job is invalid");
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const archive = await store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES });
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-editable-"));
    try {
      extractProjectArchive(archive, root, { label: "editable" });
      const metadata = validatePackage(root);
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (metadata.kind === "raw-image") {
        if (typeof rawImageOcr !== "function") throw new Error("raw editable image profile is not enabled for this worker");
        const ocr = await rawImageOcr({ inputFile: metadata.inputFile, dimensions: metadata.dimensions, isCancellationRequested });
        if (await isCancellationRequested()) throw new Error("editable job was cancelled");
        const generatedDeck = rawImageDeck(metadata, ocr);
        metadata.deckFile = path.join(root, "deck.json");
        fs.writeFileSync(metadata.deckFile, `${JSON.stringify(generatedDeck)}\n`, "utf8");
        const validated = validateDeckIr(generatedDeck, root);
        metadata.pages = validated.pages; metadata.assets = validated.assets; metadata.ocrTextOverlays = generatedDeck.pages[0].textBoxes.length;
      }
      const outputFile = path.join(root, "deck.pptx");
      await runBuilder({ executable: builderExecutable, builderArgs, deckFile: metadata.deckFile, outputFile, cwd: root, timeoutMs });
      if (!fs.existsSync(outputFile) || !fs.statSync(outputFile).isFile() || fs.statSync(outputFile).size < 1 || fs.statSync(outputFile).size > MAX_PPTX_BYTES) throw new Error("editable builder produced an invalid artifact");
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const body = fs.readFileSync(outputFile);
      const artifact = { name: "deck.pptx", objectKey: `${job.outputPrefix}deck.pptx`, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", body };
      await store.putObject({ objectKey: artifact.objectKey, body: artifact.body, contentType: artifact.mediaType });
      const raw = metadata.kind === "raw-image";
      return { artifacts: [{ name: artifact.name, objectKey: artifact.objectKey, mediaType: artifact.mediaType, sha256: sha256(artifact.body) }], quality: assertQualityReport({ passed: !raw, checks: [{ name: raw ? "raw-image-validated" : "deck-ir-validated", passed: true }, { name: "assets-resolved", passed: true }, ...(raw ? [{ name: "quality-render-not-configured", passed: false }] : []), { name: "pptx-generated", passed: true }], metrics: { pages: metadata.pages, "referenced-assets": metadata.assets, ...(raw ? { "ocr-text-overlays": metadata.ocrTextOverlays || 0 } : {}), "pptx-bytes": body.length } }) };
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { IMAGE_EXTENSIONS, MAX_DECK_BYTES, createImageToEditableArchiveHandler, rawImageDeck, readRawImageDimensions, safeAssetPath, validateDeckIr, validatePackage };
