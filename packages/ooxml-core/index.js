"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const MAX_PPTX_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 4096;
const MAX_SLIDES = 500;
const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 32 * 1024 * 1024;
const MAX_RELATIONSHIPS = 100000;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(content) {
  let value = 0xffffffff;
  for (const byte of content) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function findEocd(buffer) {
  const minimum = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_EOCD_SIGNATURE) continue;
    if (offset + 22 + buffer.readUInt16LE(offset + 20) !== buffer.length) continue;
    const disk = buffer.readUInt16LE(offset + 4);
    const centralDisk = buffer.readUInt16LE(offset + 6);
    const entriesOnDisk = buffer.readUInt16LE(offset + 8);
    const entries = buffer.readUInt16LE(offset + 10);
    const centralBytes = buffer.readUInt32LE(offset + 12);
    const centralOffset = buffer.readUInt32LE(offset + 16);
    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entries || entries > MAX_ZIP_ENTRIES || centralBytes === 0xffffffff || centralOffset === 0xffffffff || centralOffset + centralBytes > offset) throw new Error("PPTX ZIP directory is unsupported");
    return Object.freeze({ entries, centralOffset, centralBytes });
  }
  throw new Error("PPTX ZIP directory is missing");
}

function safeZipName(value) {
  if (!value || value.length > 512 || value.includes("\\") || value.startsWith("/") || value.includes("\u0000")) throw new Error("PPTX ZIP entry is invalid");
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.includes("//")) throw new Error("PPTX ZIP entry is invalid");
  return value;
}

function readCentralDirectory(buffer) {
  const eocd = findEocd(buffer);
  let offset = eocd.centralOffset;
  const end = offset + eocd.centralBytes;
  const entries = new Map();
  for (let index = 0; index < eocd.entries; index += 1) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) throw new Error("PPTX ZIP central entry is invalid");
    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const crc32Value = buffer.readUInt32LE(offset + 16);
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const nameBytes = buffer.readUInt16LE(offset + 28);
    const extraBytes = buffer.readUInt16LE(offset + 30);
    const commentBytes = buffer.readUInt16LE(offset + 32);
    const diskStart = buffer.readUInt16LE(offset + 34);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > end || diskStart !== 0 || (flags & 0x0001) !== 0 || ![0, 8].includes(compression) || compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localOffset === 0xffffffff) throw new Error("PPTX ZIP entry is unsupported");
    const name = safeZipName(buffer.subarray(offset + 46, offset + 46 + nameBytes).toString("utf8"));
    if (entries.has(name)) throw new Error("PPTX ZIP contains duplicate entries");
    entries.set(name, Object.freeze({ name, flags, compression, crc32: crc32Value, compressedBytes, uncompressedBytes, localOffset }));
    offset = next;
  }
  if (offset !== end) throw new Error("PPTX ZIP directory has trailing data");
  return entries;
}

function extractEntry(buffer, entry, limit = MAX_XML_BYTES) {
  if (!entry || entry.uncompressedBytes > limit || entry.localOffset + 30 > buffer.length || buffer.readUInt32LE(entry.localOffset) !== ZIP_LOCAL_SIGNATURE) throw new Error("PPTX ZIP data entry is invalid");
  const flags = buffer.readUInt16LE(entry.localOffset + 6);
  const compression = buffer.readUInt16LE(entry.localOffset + 8);
  const localCrc32 = buffer.readUInt32LE(entry.localOffset + 14);
  const compressedBytes = buffer.readUInt32LE(entry.localOffset + 18);
  const uncompressedBytes = buffer.readUInt32LE(entry.localOffset + 22);
  const nameBytes = buffer.readUInt16LE(entry.localOffset + 26);
  const extraBytes = buffer.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameBytes + extraBytes;
  const end = start + entry.compressedBytes;
  if (flags !== entry.flags || compression !== entry.compression || localCrc32 !== entry.crc32 || compressedBytes !== entry.compressedBytes || uncompressedBytes !== entry.uncompressedBytes || end > buffer.length || safeZipName(buffer.subarray(entry.localOffset + 30, entry.localOffset + 30 + nameBytes).toString("utf8")) !== entry.name) throw new Error("PPTX ZIP local entry does not match its directory");
  const compressed = buffer.subarray(start, end);
  let content;
  try { content = entry.compression === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: limit }); }
  catch { throw new Error("PPTX ZIP data entry cannot be decompressed"); }
  if (content.length !== entry.uncompressedBytes || content.length > limit || crc32(content) !== entry.crc32) throw new Error("PPTX ZIP data entry checksum is invalid");
  return content;
}

function relationshipOwnerDirectory(name) {
  if (name === "_rels/.rels") return "";
  const match = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(name);
  if (!match) return null;
  return path.posix.dirname(`${match[1]}/${match[2]}`);
}

function inspectRelationships(buffer, entries) {
  const targets = new Set();
  let scannedBytes = 0;
  let relationshipCount = 0;
  let unresolvedRelationshipCount = 0;
  let invalidRelationshipCount = 0;
  for (const entry of entries.values()) {
    if (!entry.name.endsWith(".rels")) continue;
    const base = relationshipOwnerDirectory(entry.name);
    if (base === null || entry.uncompressedBytes > MAX_XML_BYTES || scannedBytes + entry.uncompressedBytes > MAX_TOTAL_XML_BYTES) throw new Error("PPTX relationship XML is too large");
    const xml = extractEntry(buffer, entry).toString("utf8");
    scannedBytes += entry.uncompressedBytes;
    for (const match of xml.matchAll(/<Relationship\b[^>]*\bTarget=(['"])([^'"]+)\1[^>]*>/g)) {
      relationshipCount += 1;
      if (relationshipCount > MAX_RELATIONSHIPS) throw new Error("PPTX relationship count is too large");
      if (/\bTargetMode=(['"])External\1/.test(match[0])) continue;
      const target = match[2].split("#", 1)[0];
      if (!target || target.includes("\\") || target.includes("\u0000") || /^[a-z][a-z0-9+.-]*:/i.test(target)) { invalidRelationshipCount += 1; continue; }
      const normalized = target.startsWith("/") ? path.posix.normalize(target.slice(1)) : path.posix.normalize(path.posix.join(base, target));
      if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) { invalidRelationshipCount += 1; continue; }
      targets.add(normalized);
      if (!entries.has(normalized)) unresolvedRelationshipCount += 1;
    }
  }
  return Object.freeze({ targets, relationshipCount, unresolvedRelationshipCount, invalidRelationshipCount });
}

function unusedMediaEntries(buffer, entries) {
  const { targets } = inspectRelationships(buffer, entries);
  return [...entries.values()].filter((entry) => /^ppt\/media\/[^/]+$/.test(entry.name) && !targets.has(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
}

function countMatches(content, expression) {
  return [...content.matchAll(expression)].length;
}

function inspectPptx(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 22 || buffer.length > MAX_PPTX_BYTES || buffer.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) throw new Error("PPT quality input is not a supported PPTX ZIP");
  const entries = readCentralDirectory(buffer);
  const contentTypes = extractEntry(buffer, entries.get("[Content_Types].xml"));
  const presentation = extractEntry(buffer, entries.get("ppt/presentation.xml"));
  const contentTypesText = contentTypes.toString("utf8");
  const presentationText = presentation.toString("utf8");
  if (!/<Types(?:\s|>)/.test(contentTypesText) || !/presentationml\.presentation\.main\+xml/.test(contentTypesText) || !/<p:presentation(?:\s|>)/.test(presentationText)) throw new Error("PPTX required presentation structure is missing");
  const slideEntries = [...entries.values()].filter((entry) => /^ppt\/slides\/slide([1-9]\d*)\.xml$/.test(entry.name)).sort((left, right) => Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(left.name)[1]) - Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(right.name)[1]));
  if (!slideEntries.length || slideEntries.length > MAX_SLIDES) throw new Error("PPTX slide count is invalid");
  let xmlBytes = contentTypes.length + presentation.length;
  let textShapes = 0;
  let pictures = 0;
  let tables = 0;
  let emptySlides = 0;
  for (const entry of slideEntries) {
    if (xmlBytes + entry.uncompressedBytes > MAX_TOTAL_XML_BYTES) throw new Error("PPTX XML content is too large");
    const slide = extractEntry(buffer, entry);
    xmlBytes += slide.length;
    const text = slide.toString("utf8");
    if (!/<p:sld(?:\s|>)/.test(text)) throw new Error("PPTX slide XML is invalid");
    const slideTextShapes = countMatches(text, /<p:sp(?:\s|\/?>)/g);
    const slidePictures = countMatches(text, /<p:pic(?:\s|\/?>)/g);
    const slideTables = countMatches(text, /<a:tbl(?:\s|\/?>)/g);
    textShapes += slideTextShapes;
    pictures += slidePictures;
    tables += slideTables;
    if (slideTextShapes + slidePictures + slideTables === 0) emptySlides += 1;
  }
  const media = [...entries.keys()].filter((name) => /^ppt\/media\/[^/]+$/.test(name)).length;
  const relationships = inspectRelationships(buffer, entries);
  const unusedMedia = [...entries.values()].filter((entry) => /^ppt\/media\/[^/]+$/.test(entry.name) && !relationships.targets.has(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
  const notes = [...entries.keys()].filter((name) => /^ppt\/notesSlides\/notesSlide[1-9]\d*\.xml$/.test(name)).length;
  return Object.freeze({ archiveBytes: buffer.length, slideCount: slideEntries.length, mediaCount: media, unusedMediaCount: unusedMedia.length, notesCount: notes, textShapeCount: textShapes, pictureCount: pictures, tableCount: tables, emptySlideCount: emptySlides, xmlBytes, relationshipCount: relationships.relationshipCount, unresolvedRelationshipCount: relationships.unresolvedRelationshipCount, invalidRelationshipCount: relationships.invalidRelationshipCount, unusedMediaEntries: Object.freeze(unusedMedia) });
}

module.exports = { MAX_PPTX_BYTES, MAX_RELATIONSHIPS, MAX_SLIDES, MAX_TOTAL_XML_BYTES, MAX_XML_BYTES, MAX_ZIP_ENTRIES, crc32, extractEntry, inspectPptx, inspectRelationships, readCentralDirectory, unusedMediaEntries };
