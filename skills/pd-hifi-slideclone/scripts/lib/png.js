"use strict";

const fs = require("fs");
const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function readPng(file) {
  const buffer = fs.readFileSync(file);
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Not a PNG file: ${file}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`Interlaced PNG is not supported: ${file}`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`Only 8-bit PNG is supported: ${file}`);
  const channels = channelsForColorType(colorType, file);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const scanline = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    unfilter(scanline, previous, filter, channels);
    writeRgba(scanline, rgba, y, width, channels, colorType);
    previous = scanline;
  }

  return { width, height, rgba };
}

function writePng(file, image) {
  const colorType = 6;
  const bitDepth = 8;
  const scanlineLength = image.width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * scanlineLength;
    raw[rowOffset] = 0;
    image.rgba.copy(raw, rowOffset + 1, y * image.width * 4, (y + 1) * image.width * 4);
  }

  const chunks = [
    makeChunk("IHDR", makeIhdr(image.width, image.height, bitDepth, colorType)),
    makeChunk("IDAT", zlib.deflateSync(raw)),
    makeChunk("IEND", Buffer.alloc(0))
  ];
  fs.writeFileSync(file, Buffer.concat([PNG_SIGNATURE, ...chunks]));
}

function cropPng(source, box) {
  const x = clamp(Math.floor(box.x), 0, source.width - 1);
  const y = clamp(Math.floor(box.y), 0, source.height - 1);
  const w = clamp(Math.floor(box.w), 1, source.width - x);
  const h = clamp(Math.floor(box.h), 1, source.height - y);
  const rgba = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const srcStart = ((y + row) * source.width + x) * 4;
    const srcEnd = srcStart + w * 4;
    source.rgba.copy(rgba, row * w * 4, srcStart, srcEnd);
  }
  return { width: w, height: h, rgba };
}

function channelsForColorType(colorType, file) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`Unsupported PNG color type ${colorType}: ${file}`);
}

function unfilter(line, previous, filter, bpp) {
  for (let i = 0; i < line.length; i += 1) {
    const left = i >= bpp ? line[i - bpp] : 0;
    const up = previous[i] || 0;
    const upLeft = i >= bpp ? previous[i - bpp] || 0 : 0;
    if (filter === 1) line[i] = (line[i] + left) & 0xFF;
    else if (filter === 2) line[i] = (line[i] + up) & 0xFF;
    else if (filter === 3) line[i] = (line[i] + Math.floor((left + up) / 2)) & 0xFF;
    else if (filter === 4) line[i] = (line[i] + paeth(left, up, upLeft)) & 0xFF;
    else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function writeRgba(line, rgba, y, width, channels, colorType) {
  for (let x = 0; x < width; x += 1) {
    const src = x * channels;
    const dst = (y * width + x) * 4;
    if (colorType === 0) {
      rgba[dst] = line[src];
      rgba[dst + 1] = line[src];
      rgba[dst + 2] = line[src];
      rgba[dst + 3] = 255;
    } else if (colorType === 2) {
      rgba[dst] = line[src];
      rgba[dst + 1] = line[src + 1];
      rgba[dst + 2] = line[src + 2];
      rgba[dst + 3] = 255;
    } else if (colorType === 4) {
      rgba[dst] = line[src];
      rgba[dst + 1] = line[src];
      rgba[dst + 2] = line[src];
      rgba[dst + 3] = line[src + 1];
    } else {
      rgba[dst] = line[src];
      rgba[dst + 1] = line[src + 1];
      rgba[dst + 2] = line[src + 2];
      rgba[dst + 3] = line[src + 3];
    }
  }
}

function makeIhdr(width, height, bitDepth, colorType) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = { readPng, writePng, cropPng };
