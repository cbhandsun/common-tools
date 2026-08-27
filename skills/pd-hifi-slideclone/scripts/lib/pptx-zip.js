"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const DEFAULT_LIMITS = Object.freeze({
  maxArchiveBytes: 256 * 1024 * 1024,
  maxEntries: 20_000,
  maxEntryBytes: 16 * 1024 * 1024
});

function readZipEntryText(zipPath, entryName, options = {}) {
  assertArchiveSize(zipPath, options);
  const buffer = fs.readFileSync(zipPath);
  const entry = readZipEntry(buffer, entryName, options);
  return entry ? entry.toString("utf8") : null;
}

function readZipEntry(buffer, entryName, options = {}) {
  const entries = readZipEntries(buffer, options);
  const entry = entries.find((candidate) => candidate.name === entryName);
  if (!entry) return null;
  return readZipEntryData(buffer, entry, options);
}

function readZipEntries(buffer, options = {}) {
  const limits = normalizeLimits(options);
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > limits.maxArchiveBytes) {
    throw new Error("ZIP archive size exceeds the processing boundary.");
  }
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (totalEntries === 0xffff || centralDirectoryOffset === 0xffffffff || centralDirectorySize === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported.");
  }
  if (totalEntries > limits.maxEntries) throw new Error("ZIP entry count exceeds the processing boundary.");
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (!Number.isSafeInteger(centralDirectoryEnd) || centralDirectoryEnd > eocdOffset) {
    throw new Error("Invalid ZIP central directory boundary.");
  }
  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > centralDirectoryEnd || buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`Invalid ZIP central directory at offset ${offset}.`);
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const nextOffset = nameEnd + extraLength + commentLength;
    if (nameEnd > centralDirectoryEnd || nextOffset > centralDirectoryEnd) {
      throw new Error(`Truncated ZIP central directory at offset ${offset}.`);
    }
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
  if (offset !== centralDirectoryEnd) throw new Error("ZIP central directory size does not match its entries.");
  return entries;
}

function readZipEntryData(buffer, entry, options = {}) {
  const limits = normalizeLimits(options);
  const maxEntryBytes = boundedInteger(
    options.maxEntryBytes ?? options.maxBytes,
    1,
    512 * 1024 * 1024,
    limits.maxEntryBytes
  );
  if (entry.uncompressedSize > maxEntryBytes) {
    throw new Error(`ZIP entry ${entry.name} exceeds the processing boundary.`);
  }
  const offset = entry.localHeaderOffset;
  if (offset < 0 || offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error(`Invalid ZIP local header for ${entry.name}.`);
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (!Number.isSafeInteger(dataEnd) || dataEnd > buffer.length) {
    throw new Error(`Truncated ZIP entry ${entry.name}.`);
  }
  const compressed = buffer.subarray(dataStart, dataEnd);
  let data;
  if (entry.compressionMethod === 0) data = Buffer.from(compressed);
  if (entry.compressionMethod === 8) {
    try {
      data = zlib.inflateRawSync(compressed, { maxOutputLength: maxEntryBytes });
    } catch (error) {
      if (error?.code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|larger than/i.test(String(error?.message))) {
        throw new Error(`ZIP entry ${entry.name} exceeds the processing boundary.`);
      }
      throw error;
    }
  }
  if (!data) throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`);
  if (data.length > maxEntryBytes) throw new Error(`ZIP entry ${entry.name} exceeds the processing boundary.`);
  if (entry.uncompressedSize !== data.length) {
    throw new Error(`ZIP entry ${entry.name} inflated to an unexpected size.`);
  }
  return data;
}

function rewriteZipEntries(sourcePath, outputPath, replacements = {}, options = {}) {
  const maxArchiveBytes = boundedInteger(options.maxArchiveBytes, 1024, 256 * 1024 * 1024, 64 * 1024 * 1024);
  const maxExpandedBytes = boundedInteger(options.maxExpandedBytes, 1024, 512 * 1024 * 1024, 128 * 1024 * 1024);
  const source = fs.statSync(sourcePath);
  if (!source.isFile() || source.size <= 0 || source.size > maxArchiveBytes) throw new Error("ZIP source exceeds the rewrite boundary");
  const buffer = fs.readFileSync(sourcePath);
  const entries = readZipEntries(buffer, {
    maxArchiveBytes,
    maxEntries: 20000,
    maxEntryBytes: maxExpandedBytes
  });
  if (entries.length === 0 || entries.length > 20000) throw new Error("ZIP entry count exceeds the rewrite boundary");
  const replacementMap = new Map(Object.entries(replacements || {}).map(([name, value]) => [safeEntryName(name), Buffer.from(value)]));
  if ([...replacementMap.keys()].some((name) => !name)) throw new Error("ZIP replacement contains an invalid entry name");
  const outputEntries = [];
  let expandedBytes = 0;
  for (const entry of entries) {
    const name = safeEntryName(entry.name);
    if (!name) throw new Error("ZIP contains an unsafe entry name");
    const data = replacementMap.has(name)
      ? replacementMap.get(name)
      : readZipEntryData(buffer, entry, { maxArchiveBytes, maxEntryBytes: maxExpandedBytes });
    replacementMap.delete(name);
    expandedBytes += data.length;
    if (expandedBytes > maxExpandedBytes) throw new Error("ZIP expanded data exceeds the rewrite boundary");
    outputEntries.push({ name, data });
  }
  if (replacementMap.size > 0) throw new Error("ZIP replacement target was not found");
  writeStoredZipAtomic(outputPath, outputEntries);
  return { entries: outputEntries.length, expandedBytes };
}

function writeStoredZipAtomic(outputPath, entries) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = safeEntryName(entry.name);
    if (!name) throw new Error("ZIP output contains an unsafe entry name");
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const flags = 0x0800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  try {
    fs.writeFileSync(temp, Buffer.concat([...localParts, central, eocd]));
    fs.renameSync(temp, resolved);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function safeEntryName(value) {
  const name = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name || name.includes("\0") || name.split("/").includes("..") || /^[A-Za-z]:/.test(name)) return "";
  return name;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function normalizeLimits(options = {}) {
  return {
    maxArchiveBytes: boundedInteger(
      options.maxArchiveBytes,
      1024,
      1024 * 1024 * 1024,
      DEFAULT_LIMITS.maxArchiveBytes
    ),
    maxEntries: boundedInteger(options.maxEntries, 1, 65_534, DEFAULT_LIMITS.maxEntries),
    maxEntryBytes: boundedInteger(
      options.maxEntryBytes ?? options.maxBytes,
      1,
      512 * 1024 * 1024,
      DEFAULT_LIMITS.maxEntryBytes
    )
  };
}

function assertArchiveSize(file, options = {}) {
  const limits = normalizeLimits(options);
  const stats = fs.statSync(file);
  if (!stats.isFile() || stats.size < 22 || stats.size > limits.maxArchiveBytes) {
    throw new Error("ZIP archive size exceeds the processing boundary.");
  }
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new Error("Invalid ZIP file: end of central directory not found.");
}

module.exports = {
  readZipEntries,
  readZipEntry,
  readZipEntryText,
  rewriteZipEntries,
  writeStoredZipAtomic
};
