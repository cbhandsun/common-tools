"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { containsControlCharacter } = require("../capability-contracts");

const MAX_ASSETS = 100;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 16384;
const MAX_IMAGE_PIXELS = 40_000_000;
const SOURCE_KINDS = Object.freeze(["customer-provided", "generated", "licensed", "original"]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) { if (!plainObject(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new TypeError(`${label} is invalid`); }
function text(value, label, maximum) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.trim(); if (!normalized || normalized.length > maximum || containsControlCharacter(normalized)) throw new TypeError(`${label} is invalid`); return normalized;
}
function assetId(value, label) { const id = text(value, label, 80); if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) throw new TypeError(`${label} is invalid`); return id; }
function sourceRecord(value, label) {
  exactKeys(value, ["kind", "locator", "license", "author", "attribution"], label);
  if (!SOURCE_KINDS.includes(value.kind)) throw new TypeError(`${label} kind is invalid`);
  return Object.freeze({ kind: value.kind, locator: text(value.locator, `${label} locator`, 1024), license: text(value.license, `${label} license`, 160), ...(value.author === undefined ? {} : { author: text(value.author, `${label} author`, 160) }), ...(value.attribution === undefined ? {} : { attribution: text(value.attribution, `${label} attribution`, 500) }) });
}
function normalizeAssetManifest(value) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ASSETS) throw new TypeError("presentation assets are invalid");
  const seen = new Set();
  return Object.freeze(value.map((entry, index) => {
    const label = `presentation asset ${index + 1}`; exactKeys(entry, ["id", "path", "sha256", "source"], label);
    const id = assetId(entry.id, `${label} id`); if (seen.has(id)) throw new TypeError("presentation asset ids must be unique"); seen.add(id);
    const relativePath = text(entry.path, `${label} path`, 512);
    if (relativePath.includes("\\") || path.posix.isAbsolute(relativePath) || path.posix.normalize(relativePath) !== relativePath || relativePath.startsWith("../") || !/[.](?:png|jpe?g)$/iu.test(relativePath)) throw new TypeError(`${label} path is invalid`);
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 || "")) throw new TypeError(`${label} sha256 is invalid`);
    return Object.freeze({ id, path: relativePath, sha256: entry.sha256, source: sourceRecord(entry.source, `${label} source`) });
  }));
}
function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++]; if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 1 >= bytes.length) break; const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) return { widthPx: bytes.readUInt16BE(offset + 5), heightPx: bytes.readUInt16BE(offset + 3) };
    offset += length;
  }
  throw new Error("presentation JPEG asset dimensions are invalid");
}
function inspectImageAsset(file) {
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 24 || info.size > MAX_ASSET_BYTES) throw new Error("presentation image asset is not a bounded regular file");
  const bytes = fs.readFileSync(file); const extension = path.extname(file).toLowerCase(); let dimensions;
  if (extension === ".png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(-8, -4).toString("ascii") === "IEND") dimensions = { widthPx: bytes.readUInt32BE(16), heightPx: bytes.readUInt32BE(20) };
  else if ([".jpg", ".jpeg"].includes(extension) && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) dimensions = jpegDimensions(bytes);
  else throw new Error("presentation image asset format is invalid");
  const pixels = dimensions.widthPx * dimensions.heightPx;
  if (!Number.isSafeInteger(pixels) || dimensions.widthPx < 1 || dimensions.heightPx < 1 || dimensions.widthPx > MAX_IMAGE_DIMENSION || dimensions.heightPx > MAX_IMAGE_DIMENSION || pixels > MAX_IMAGE_PIXELS) throw new Error("presentation image asset dimensions exceed safe limits");
  return Object.freeze({ ...dimensions, bytes: info.size, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
}
function resolveAssetPack(specFile, assets) {
  const root = fs.realpathSync.native(path.dirname(specFile));
  return Object.freeze(assets.map((asset) => {
    const file = path.resolve(root, ...asset.path.split("/")); const relative = path.relative(root, file);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("presentation asset escapes the spec directory");
    const inspected = inspectImageAsset(file); if (inspected.sha256 !== asset.sha256) throw new Error("presentation asset hash does not match its manifest");
    return Object.freeze({ ...asset, file, ...inspected });
  }));
}
function materializeAssetPack(assets, output) {
  if (assets.length === 0) return Object.freeze({ paths: Object.freeze({}), records: Object.freeze([]) });
  const directory = path.join(output, "assets"); fs.mkdirSync(directory, { recursive: false }); const paths = {}; const records = [];
  for (const asset of assets) {
    const extension = path.extname(asset.file).toLowerCase(); const name = `${asset.id}${extension}`; const target = path.join(directory, name);
    fs.copyFileSync(asset.file, target, fs.constants.COPYFILE_EXCL); paths[asset.id] = `assets/${name}`;
    records.push(Object.freeze({ id: asset.id, path: paths[asset.id], sha256: asset.sha256, widthPx: asset.widthPx, heightPx: asset.heightPx, bytes: asset.bytes, source: asset.source }));
  }
  return Object.freeze({ paths: Object.freeze(paths), records: Object.freeze(records) });
}

module.exports = { MAX_ASSETS, MAX_ASSET_BYTES, SOURCE_KINDS, inspectImageAsset, materializeAssetPack, normalizeAssetManifest, resolveAssetPack, sourceRecord };
