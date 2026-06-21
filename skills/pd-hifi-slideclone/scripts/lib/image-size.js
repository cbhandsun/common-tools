"use strict";

const fs = require("fs");
const path = require("path");

function readImageSize(file) {
  const ext = path.extname(file).toLowerCase();
  const buffer = fs.readFileSync(file);
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

module.exports = { readImageSize };
