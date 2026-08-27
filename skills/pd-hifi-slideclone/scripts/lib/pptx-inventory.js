"use strict";

const fs = require("fs");
const zlib = require("zlib");

const DEFAULT_ZIP_LIMITS = Object.freeze({
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 20_000,
  maxEntryBytes: 8 * 1024 * 1024
});

function countPptxSlides(file) {
  const slides = new Set();
  for (const { name } of listZipEntries(file)) {
    if (/^ppt\/slides\/slide\d+\.xml$/i.test(name)) slides.add(name.toLowerCase());
  }
  return slides.size;
}

function listZipEntries(file, options = {}) {
  const buffer = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const limits = normalizeZipLimits(options);
  if (buffer.length < 22 || buffer.length > limits.maxArchiveBytes) {
    throw new Error("PPTX archive size exceeds the processing boundary");
  }
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return [];
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (totalEntries === 0xffff || centralDirectoryOffset === 0xffffffff || centralDirectorySize === 0xffffffff) {
    throw new Error("ZIP64 PPTX archives are not supported");
  }
  if (totalEntries > limits.maxEntries) throw new Error("PPTX entry count exceeds the processing boundary");
  const end = centralDirectoryOffset + centralDirectorySize;
  if (!Number.isSafeInteger(end) || centralDirectoryOffset < 0 || end > eocdOffset) {
    throw new Error("Invalid PPTX central directory boundary");
  }
  const entries = [];
  let offset = centralDirectoryOffset;
  while (entries.length < totalEntries) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid PPTX central directory entry at offset ${offset}`);
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const nextOffset = nameEnd + extraLength + commentLength;
    if (nameEnd > end || nextOffset > end) throw new Error("Truncated PPTX central directory entry");
    const name = buffer.toString("utf8", nameStart, nameEnd);
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
    offset = nextOffset;
  }
  if (offset !== end) throw new Error("PPTX central directory size does not match its entries");
  return entries;
}

function readZipEntry(file, entryName, options = {}) {
  const buffer = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  const limits = normalizeZipLimits(options);
  const normalizedName = String(entryName || "").replace(/\\/g, "/").toLowerCase();
  const entry = listZipEntries(buffer, limits).find((item) => item.name.toLowerCase() === normalizedName);
  if (!entry) return null;
  const maxEntryBytes = normalizeMaxBytes(options.maxBytes, limits.maxEntryBytes);
  if (entry.uncompressedSize > maxEntryBytes || entry.compressedSize > limits.maxArchiveBytes) {
    throw new Error(`zip entry too large: ${entry.name}`);
  }
  const localOffset = entry.localHeaderOffset;
  if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`invalid local zip header: ${entry.name}`);
  }
  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new Error(`truncated zip entry: ${entry.name}`);
  const compressed = buffer.subarray(dataStart, dataEnd);
  let data;
  if (entry.compressionMethod === 0) data = Buffer.from(compressed);
  else if (entry.compressionMethod === 8) {
    try {
      data = zlib.inflateRawSync(compressed, { maxOutputLength: maxEntryBytes });
    } catch (error) {
      if (error?.code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|larger than/i.test(String(error?.message))) {
        throw new Error(`zip entry too large: ${entry.name}`);
      }
      throw error;
    }
  } else {
    throw new Error(`unsupported zip compression method ${entry.compressionMethod}: ${entry.name}`);
  }
  if (data.length > maxEntryBytes) throw new Error(`zip entry too large: ${entry.name}`);
  if (entry.uncompressedSize !== data.length) throw new Error(`zip entry length mismatch: ${entry.name}`);
  return data;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function normalizeMaxBytes(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeZipLimits(options = {}) {
  return {
    maxArchiveBytes: boundedInteger(
      options.maxArchiveBytes,
      1024,
      1024 * 1024 * 1024,
      DEFAULT_ZIP_LIMITS.maxArchiveBytes
    ),
    maxEntries: boundedInteger(options.maxEntries, 1, 65_534, DEFAULT_ZIP_LIMITS.maxEntries),
    maxEntryBytes: boundedInteger(
      options.maxEntryBytes,
      1024,
      512 * 1024 * 1024,
      DEFAULT_ZIP_LIMITS.maxEntryBytes
    )
  };
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

module.exports = {
  countPptxSlides,
  findEndOfCentralDirectory,
  listZipEntries,
  readZipEntry
};
