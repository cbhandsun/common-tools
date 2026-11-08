// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { readPngBuffer } = require("../slideclone-core/png");
const { isCandidateVerificationCacheEntry } = require("./candidate-verification-cache");

/** @typedef {import('./candidate-verification-cache').VerificationCacheEntry} VerificationCacheEntry */
/** @typedef {{file:string,bytes:Buffer,pixels:number}} PageSnapshot */
/** @typedef {{root:string,pages:PageSnapshot[],bytes:number,pixels:number}} Snapshot */
const MIB = 1024 * 1024;
const DEFAULTS = Object.freeze({ maxEntries: 64, maxBytes: 64 * MIB, maxEntryBytes: 32 * MIB,
  maxPages: 20, maxTotalPages: 200, maxPixels: 200000000, maxEntryPixels: 80000000,
  maxPagePixels: 40000000, maxReplayBytes: 256 * MIB, maxReplayPages: 512 });
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === Object.keys(value).length
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}

/** @param {unknown} value @param {number} maximum @returns {string[]} */
function pagePaths(value, maximum) {
  if (value === null || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError("rendered snapshot pages are invalid");
  const pages = [];
  for (let index = 0; index < value.length; index++) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (!item || !("value" in item) || typeof item.value !== "string") throw new TypeError("rendered snapshot page is invalid");
    pages.push(item.value);
  }
  if (new Set(pages).size !== pages.length) throw new TypeError("rendered snapshot pages are ambiguous");
  return pages;
}

/** @param {unknown} value @param {number} count @returns {readonly string[]|null} */
function validatedRenderedPagePaths(value, count) {
  if (!record(value) || value.ok !== true || !record(value.data)) return null;
  const pages = value.data.renderedPages;
  if (pages === null || typeof pages !== "object" || types.isProxy(pages) || !Array.isArray(pages)
    || Object.getPrototypeOf(pages) !== Array.prototype || pages.length !== count || count < 1 || count > 20
    || Reflect.ownKeys(pages).length !== count + 1) return null;
  const images = [];
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(pages, String(index));
    if (!descriptor || !("value" in descriptor) || !record(descriptor.value) || typeof descriptor.value.image !== "string") return null;
    images.push(descriptor.value.image);
  }
  return Object.freeze(images);
}

/** @param {unknown} value @returns {string} */
function ownedRoot(value) {
  if (typeof value !== "string" || value.length > 32768 || !path.isAbsolute(value) || value.includes("\0")) {
    throw new TypeError("rendered snapshot root is invalid");
  }
  const root = path.resolve(value), info = fs.lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(root) !== root) throw new TypeError("rendered snapshot root is unsafe");
  return root;
}

/** @param {string} root @param {string} file */
function ownedFile(root, file) {
  if (!path.isAbsolute(file) || file.length > 32768 || [...file].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || file.split(/[\\/]/u).includes("..") || path.extname(file).toLowerCase() !== ".png") throw new TypeError("rendered snapshot path is invalid");
  const resolved = path.resolve(file), relative = path.relative(root, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.includes(":")) {
    throw new TypeError("rendered snapshot path is outside the root");
  }
  let ancestor = root;
  const parts = relative.split(path.sep);
  for (const part of parts.slice(0, -1)) {
    ancestor = path.join(ancestor, part);
    const info = fs.lstatSync(ancestor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new TypeError("rendered snapshot directory is unsafe");
  }
  const info = fs.lstatSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(resolved) !== resolved) throw new TypeError("rendered snapshot file is unsafe");
  return resolved;
}

/** @param {string} root @param {string} file @param {number} maximum */
function readOwnedPng(root, file, maximum) {
  const resolved = ownedFile(root, file), info = fs.lstatSync(resolved);
  if (info.size < 57 || info.size > maximum) throw new RangeError("rendered snapshot bytes exceed the boundary");
  const descriptor = fs.openSync(resolved, "r");
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size !== info.size || before.ino !== info.ino || before.dev !== info.dev
      || before.mtimeMs !== info.mtimeMs || before.ctimeMs !== info.ctimeMs) throw new Error("rendered snapshot changed");
    const bytes = Buffer.allocUnsafe(before.size);
    let position = 0;
    while (position < bytes.length) {
      const count = fs.readSync(descriptor, bytes, position, bytes.length - position, position);
      if (!count) throw new Error("rendered snapshot is incomplete");
      position += count;
    }
    const after = fs.fstatSync(descriptor), current = fs.lstatSync(ownedFile(root, resolved));
    if ([after, current].some(item => item.size !== before.size || item.ino !== before.ino || item.dev !== before.dev
      || item.mtimeMs !== before.mtimeMs || item.ctimeMs !== before.ctimeMs)) throw new Error("rendered snapshot changed");
    return bytes;
  } finally { fs.closeSync(descriptor); }
}

/** Validate chunk envelopes/checksums before using the existing bounded PNG decoder.
 * @param {Buffer} bytes @param {number} maximumPixels @returns {number} */
function validatePng(bytes, maximumPixels) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new TypeError("rendered snapshot is not PNG");
  let offset = 8, chunks = 0, sawEnd = false;
  while (offset + 12 <= bytes.length) {
    if (++chunks > 4096) throw new RangeError("rendered snapshot chunk count exceeds the boundary");
    const length = bytes.readUInt32BE(offset), end = offset + 8 + length;
    if (end + 4 > bytes.length) throw new TypeError("rendered snapshot chunk is truncated");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/u.test(type) || (offset === 8 && (type !== "IHDR" || length !== 13))
      || (offset !== 8 && type === "IHDR") || (/^[A-Z]/u.test(type) && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type))) {
      throw new TypeError("rendered snapshot chunk is unsupported");
    }
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end; index++) crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ (bytes[index] ?? 0)) & 255] ?? 0);
    if (((crc ^ 0xffffffff) >>> 0) !== bytes.readUInt32BE(end)) throw new TypeError("rendered snapshot checksum is invalid");
    if (type === "IEND") {
      if (length !== 0 || end + 4 !== bytes.length) throw new TypeError("rendered snapshot has trailing data");
      sawEnd = true; break;
    }
    offset = end + 4;
  }
  if (!sawEnd || bytes[26] !== 0 || bytes[27] !== 0) throw new TypeError("rendered snapshot PNG is incomplete");
  const image = readPngBuffer(bytes, { maxFileBytes: Math.max(1024, bytes.length), maxPixels: maximumPixels,
    maxDimension: 16384, maxInflatedBytes: Math.max(1024, maximumPixels * 5 + 16384) });
  return image.width * image.height;
}

/** @param {unknown} options */
function limitsFor(options) {
  if (!record(options)) throw new TypeError("rendered snapshot cache options are invalid");
  /** @type {{-readonly [K in keyof typeof DEFAULTS]:number}} */
  const limits = { ...DEFAULTS };
  for (const key of Object.keys(options)) if (!(key in DEFAULTS)) throw new TypeError("rendered snapshot cache option is unknown");
  for (const key of /** @type {(keyof typeof DEFAULTS)[]} */ (Object.keys(DEFAULTS))) {
    const value = options[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > DEFAULTS[key]) {
      throw new RangeError("rendered snapshot cache option exceeds the boundary");
    }
    limits[key] = value;
  }
  return limits;
}

/** Remove only our unpublished replay files; successful replay paths live until job-root cleanup.
 * @param {string} root @param {string} directory @param {string[]} files @returns {boolean} */
function cleanupReplay(root, directory, files) {
  try {
    if (ownedRoot(root) !== root || path.dirname(directory) !== root || !path.basename(directory).startsWith("quality-snapshot-replay-")) return false;
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(directory) !== directory) return false;
    for (const file of files) fs.unlinkSync(ownedFile(root, file));
    fs.rmdirSync(directory);
    return true;
  } catch { return false; }
}

/** Private PNG bytes attach to an immutable verification entry, never renderer paths or global metric signatures.
 * @param {unknown} [options] */
function createRenderedPageSnapshotCache(options = {}) {
  const limits = limitsFor(options);
  /** @type {Map<VerificationCacheEntry,Snapshot>} */
  const entries = new Map();
  let bytesHeld = 0, pixelsHeld = 0, pagesHeld = 0, replayBytes = 0, replayPages = 0;
  /** @param {VerificationCacheEntry} entry */
  function remove(entry) {
    const snapshot = entries.get(entry);
    if (!snapshot) return;
    bytesHeld -= snapshot.bytes; pixelsHeld -= snapshot.pixels; pagesHeld -= snapshot.pages.length;
    entries.delete(entry);
  }
  return Object.freeze({
    /** Capture before comparison; commit only after unchanged files and complete quality are established.
     * @param {unknown} input */
    capture(input) {
      /** @type {Snapshot} */ let snapshot;
      try {
        if (!record(input)) return null;
        const root = ownedRoot(input.root), paths = pagePaths(input.pages, limits.maxPages);
        const pages = []; let totalBytes = 0, totalPixels = 0;
        for (const file of paths) {
          const bytes = readOwnedPng(root, file, Math.min(limits.maxEntryBytes, limits.maxBytes) - totalBytes);
          const pixels = validatePng(bytes, Math.min(limits.maxPagePixels, limits.maxEntryPixels - totalPixels, limits.maxPixels - totalPixels));
          pages.push({ file, bytes, pixels }); totalBytes += bytes.length; totalPixels += pixels;
        }
        if (pages.length > limits.maxTotalPages) return null;
        snapshot = { root, pages, bytes: totalBytes, pixels: totalPixels };
      } catch { return null; }
      let committed = false;
      return Object.freeze({
        /** @param {unknown} entry */
        commit(entry) {
          if (committed) return false;
          committed = true;
          if (!isCandidateVerificationCacheEntry(entry) || entry.root !== snapshot.root || entry.sourceCount !== snapshot.pages.length) return false;
          try {
            if (ownedRoot(snapshot.root) !== snapshot.root) return false;
            for (const page of snapshot.pages) if (!readOwnedPng(snapshot.root, page.file, page.bytes.length).equals(page.bytes)) return false;
          } catch { return false; }
          remove(entry); entries.set(entry, snapshot);
          bytesHeld += snapshot.bytes; pixelsHeld += snapshot.pixels; pagesHeld += snapshot.pages.length;
          while (entries.size > limits.maxEntries || bytesHeld > limits.maxBytes || pixelsHeld > limits.maxPixels || pagesHeld > limits.maxTotalPages) {
            const oldest = entries.keys().next().value;
            if (!oldest) break;
            remove(oldest);
          }
          return entries.has(entry);
        }
      });
    },
    /** @param {unknown} input @returns {readonly string[]|null} */
    replay(input) {
      if (!record(input) || !isCandidateVerificationCacheEntry(input.entry)) return null;
      const entry = input.entry, snapshot = entries.get(entry);
      if (!snapshot || snapshot.root !== input.root || replayBytes + snapshot.bytes > limits.maxReplayBytes
        || replayPages + snapshot.pages.length > limits.maxReplayPages) return null;
      let directory = "";
      let reserved = false;
      /** @type {string[]} */ const files = [];
      try {
        const root = ownedRoot(input.root);
        if (root !== entry.root) return null;
        directory = fs.mkdtempSync(path.join(root, "quality-snapshot-replay-"));
        replayBytes += snapshot.bytes; replayPages += snapshot.pages.length; reserved = true;
        for (const [index, page] of snapshot.pages.entries()) {
          if (path.dirname(directory) !== root || ownedRoot(root) !== root || ownedRoot(directory) !== directory) {
            throw new Error("rendered snapshot replay directory changed");
          }
          const file = path.join(directory, `page-${String(index + 1).padStart(3, "0")}.png`);
          const descriptor = fs.openSync(file, "wx", 0o600);
          files.push(file);
          try { fs.writeFileSync(descriptor, Buffer.from(page.bytes)); }
          finally { fs.closeSync(descriptor); }
          if (!readOwnedPng(root, file, page.bytes.length).equals(page.bytes)) throw new Error("rendered snapshot replay changed");
        }
        entries.delete(entry); entries.set(entry, snapshot);
        return Object.freeze(files);
      } catch {
        if (directory && cleanupReplay(snapshot.root, directory, files) && reserved) {
          replayBytes -= snapshot.bytes; replayPages -= snapshot.pages.length;
        }
        return null;
      }
    },
    clear() { entries.clear(); bytesHeld = 0; pixelsHeld = 0; pagesHeld = 0; }
  });
}

module.exports = { createRenderedPageSnapshotCache, validatedRenderedPagePaths };
