"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { gzipSync } = require("node:zlib");
const { validateDeckIr, safeAssetPath } = require("./deck-ir-admission");
const { MAX_DECK_BYTES, IMAGE_EXTENSIONS } = require("./archive-admission");

const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

function readOwnedFile(root, relative, maximum) {
  const parts = relative.split("/");
  let file = root;
  for (const [index, part] of parts.entries()) {
    file = path.join(file, part);
    const info = fs.lstatSync(file);
    if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw new Error("structured archive requires regular owned files");
    if (index === parts.length - 1 && (info.size < 1 || info.size > maximum)) throw new Error("structured archive file exceeds limits");
  }
  const real = fs.realpathSync(file);
  if (!real.startsWith(`${root}${path.sep}`)) throw new Error("structured archive asset escapes its root");
  const body = fs.readFileSync(file);
  if (body.length < 1 || body.length > maximum) throw new Error("structured archive file exceeds limits");
  return body;
}

function createStructuredDeckArchive({ inputFile, outputFile }) {
  if (typeof inputFile !== "string" || !path.isAbsolute(inputFile) || path.extname(inputFile).toLowerCase() !== ".json") throw new TypeError("structured archive requires an absolute JSON input");
  if (typeof outputFile !== "string" || !path.isAbsolute(outputFile) || path.extname(outputFile).toLowerCase() !== ".gz") throw new TypeError("structured archive requires an absolute .gz output");
  if (fs.existsSync(outputFile)) throw new Error("structured archive output already exists");
  const root = fs.realpathSync(path.dirname(inputFile));
  const bytes = readOwnedFile(root, path.basename(inputFile), MAX_DECK_BYTES);
  let deck;
  try { deck = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("structured archive deck JSON is invalid"); }
  validateDeckIr(deck, root);
  if (deck.pages.length > 20 || deck.pages.some(page => typeof page.source?.pageImage !== "string")) throw new Error("structured archive requires a source image for every page, up to twenty pages");
  const assets = new Map();
  let totalBytes = bytes.length;
  function rewrite(value, parentKey = "") {
    if (Array.isArray(value)) return value.map(item => rewrite(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if ((key.toLowerCase() === "assetpath" || (key.toLowerCase() === "pageimage" && parentKey.toLowerCase() === "source")) && item != null) {
        const asset = safeAssetPath(item);
        if (!assets.has(asset)) {
          const extension = path.extname(asset).toLowerCase();
          if (!IMAGE_EXTENSIONS.has(extension)) throw new Error("structured archive asset type is invalid");
          const body = readOwnedFile(root, asset, MAX_ASSET_BYTES);
          totalBytes += body.length;
          if (totalBytes > MAX_TOTAL_BYTES) throw new Error("structured archive exceeds total byte limit");
          assets.set(asset, { name: `assets/item-${String(assets.size + 1).padStart(4, "0")}${extension}`, body });
        }
        return [key, assets.get(asset).name];
      }
      return [key, rewrite(item, key)];
    }));
  }
  const archivedDeck = rewrite(deck);
  const { resolveStructuredSourceImages } = require("./structured-source-images");
  resolveStructuredSourceImages(deck, root);
  const { tarEntry } = require("./team-raw-image-archive");
  const deckBody = Buffer.from(JSON.stringify(archivedDeck));
  if (deckBody.length > MAX_DECK_BYTES) throw new Error("structured archive deck exceeds limits");
  const archive = gzipSync(Buffer.concat([tarEntry("deck.json", deckBody), ...[...assets.values()].map(asset => tarEntry(asset.name, asset.body)), Buffer.alloc(1024)]));
  let created = false;
  try {
    const descriptor = fs.openSync(outputFile, "wx", 0o600);
    created = true;
    try { fs.writeFileSync(descriptor, archive); } finally { fs.closeSync(descriptor); }
  } catch (error) {
    if (created) fs.rmSync(outputFile, { force: true });
    throw error;
  }
  return Object.freeze({ archive: outputFile, contentType: "application/gzip", contentLength: archive.length, sha256: crypto.createHash("sha256").update(archive).digest("hex"), pages: deck.pages.length, assets: assets.size, kind: "deck-ir" });
}

module.exports = { createStructuredDeckArchive };
