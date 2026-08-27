"use strict";

const fs = require("fs");
const path = require("path");

function readImageSize(file) {
  const ext = path.extname(file).toLowerCase();
  const buffer = fs.readFileSync(file);
  return readImageSizeBuffer(buffer, ext);
}

function readImageSizeBuffer(buffer, extension) {
  const ext = typeof extension === "string" ? extension.toLowerCase() : "";
  if (!Buffer.isBuffer(buffer)) return {};
  if (ext === ".png" && buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return {
      widthPx: buffer.readUInt32BE(16),
      heightPx: buffer.readUInt32BE(20)
    };
  }
  if ((ext === ".jpg" || ext === ".jpeg") && buffer.length > 4) {
    return readJpegSize(buffer);
  }
  return {};
}

function hasCompleteImageContainer(buffer, extension) {
  const ext = typeof extension === "string" ? extension.toLowerCase() : "";
  if (!Buffer.isBuffer(buffer)) return false;
  if (ext === ".png") return hasCompletePngContainer(buffer);
  if (ext === ".jpg" || ext === ".jpeg") return hasCompleteJpegContainer(buffer);
  return false;
}

function hasCompletePngContainer(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) return false;
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > buffer.length) return false;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      const data = buffer.subarray(dataStart, dataEnd);
      if (data.readUInt32BE(0) < 1 || data.readUInt32BE(4) < 1 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) return false;
      sawHeader = true;
    } else if (type === "IDAT") {
      sawData = true;
    } else if (type === "IEND") {
      return sawData && length === 0 && chunkEnd === buffer.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function hasCompleteJpegContainer(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return false;
  let offset = 2;
  let sawFrame = false;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF) return false;
    while (offset < buffer.length && buffer[offset] === 0xFF) offset += 1;
    if (offset >= buffer.length) return false;
    const marker = buffer[offset++];
    if (marker === 0xD9) return sawFrame && offset === buffer.length;
    if (marker === 0xD8 || marker === 0x00) return false;
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
    if (offset + 2 > buffer.length) return false;
    const segmentLength = buffer.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > buffer.length) return false;
    if (marker >= 0xC0 && marker <= 0xC3) {
      if (segmentLength < 8 || buffer[offset + 2] < 1 || buffer.readUInt16BE(offset + 3) < 1 || buffer.readUInt16BE(offset + 5) < 1) return false;
      sawFrame = true;
    }
    offset = segmentEnd;
    if (marker !== 0xDA) continue;
    const markerOffset = nextJpegMarker(buffer, offset);
    if (markerOffset < 0) return false;
    offset = markerOffset;
  }
  return false;
}

function nextJpegMarker(buffer, offset) {
  for (let index = offset; index + 1 < buffer.length; index += 1) {
    if (buffer[index] !== 0xFF) continue;
    let markerIndex = index + 1;
    while (markerIndex < buffer.length && buffer[markerIndex] === 0xFF) markerIndex += 1;
    if (markerIndex >= buffer.length) return -1;
    const marker = buffer[markerIndex];
    if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
      index = markerIndex;
      continue;
    }
    return index;
  }
  return -1;
}

function readJpegSize(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xFF || offset + 4 >= buffer.length) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xC0 && marker <= 0xC3 && offset + 8 < buffer.length) {
      return {
        heightPx: buffer.readUInt16BE(offset + 5),
        widthPx: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return {};
}

module.exports = { hasCompleteImageContainer, readImageSize, readImageSizeBuffer };
