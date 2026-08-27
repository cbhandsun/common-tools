"use strict";

const fs = require("fs");
const zlib = require("zlib");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 128 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxDimension: 32_768,
  maxInflatedBytes: 192 * 1024 * 1024
});
const pngReadCacheStorage = new AsyncLocalStorage();

function readPng(file, options = {}) {
  const limits = normalizeReadLimits(options);
  const stats = fs.statSync(file);
  if (!stats.isFile() || stats.size < PNG_SIGNATURE.length || stats.size > limits.maxFileBytes) {
    throw new Error(`PNG file size exceeds the processing boundary: ${file}`);
  }
  const activeCache = pngReadCacheStorage.getStore();
  const resolved = pathForCache(file);
  const cacheKey = `${resolved}:${stats.size}:${Math.trunc(stats.mtimeMs)}:${Math.trunc(stats.ctimeMs)}`;
  const cached = activeCache?.entries.get(cacheKey);
  if (cached) {
    validateCachedImage(cached, stats, limits, file);
    activeCache.hits += 1;
    return clonePng(cached);
  }
  const buffer = fs.readFileSync(file);
  const decoded = readPngBuffer(buffer, { ...options, label: file });
  if (activeCache) {
    activeCache.misses += 1;
    const bytes = decoded.rgba.length;
    if (bytes <= activeCache.maxBytes - activeCache.bytes) {
      activeCache.entries.set(cacheKey, decoded);
      activeCache.bytes += bytes;
      return clonePng(decoded);
    }
  }
  return decoded;
}

function withPngReadCache(callback, options = {}) {
  if (typeof callback !== "function") throw new TypeError("PNG cache callback must be a function");
  const maxBytes = boundedCacheBytes(options.maxBytes);
  const state = {
    entries: new Map(),
    bytes: 0,
    hits: 0,
    misses: 0,
    maxBytes,
    stats() {
      return { hits: this.hits, misses: this.misses, entries: this.entries.size, bytes: this.bytes };
    }
  };
  return pngReadCacheStorage.run(state, () => callback(state));
}

function validateCachedImage(image, stats, limits, file) {
  validateDimensions(image.width, image.height, limits, file);
  if (stats.size > limits.maxFileBytes || image.rgba.length > limits.maxInflatedBytes) {
    throw new Error(`PNG cached data exceeds the processing boundary: ${file}`);
  }
}

function clonePng(image) {
  return { width: image.width, height: image.height, rgba: Buffer.from(image.rgba) };
}

function boundedCacheBytes(value) {
  if (value === undefined || value === null || value === "") return 256 * 1024 * 1024;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1024 * 1024 || number > 1024 * 1024 * 1024) {
    throw new RangeError("PNG read cache must be between 1 MiB and 1 GiB");
  }
  return number;
}

function pathForCache(file) {
  return path.resolve(file);
}

function readPngBuffer(buffer, options = {}) {
  const limits = normalizeReadLimits(options);
  const file = options.label || "<buffer>";
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length || buffer.length > limits.maxFileBytes) {
    throw new Error(`PNG buffer size exceeds the processing boundary: ${file}`);
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Not a PNG file: ${file}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  let palette = null;
  let paletteAlpha = null;
  let sawHeader = false;
  let sawEnd = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > buffer.length) {
      throw new Error(`Truncated PNG chunk ${type || "<unknown>"}: ${file}`);
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (sawHeader || length !== 13) throw new Error(`Invalid PNG header: ${file}`);
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error(`Interlaced PNG is not supported: ${file}`);
      validateDimensions(width, height, limits, file);
      sawHeader = true;
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      paletteAlpha = Buffer.from(data);
    } else if (type === "IDAT") {
      if (!sawHeader) throw new Error(`PNG image data appeared before the header: ${file}`);
      idat.push(data);
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }
    offset = chunkEnd;
  }

  if (!sawHeader || !sawEnd || idat.length === 0) throw new Error(`PNG structure is incomplete: ${file}`);
  if (bitDepth !== 8) throw new Error(`Only 8-bit PNG is supported: ${file}`);
  const channels = channelsForColorType(colorType, file);
  const stride = width * channels;
  const expectedRawBytes = height * (stride + 1);
  if (!Number.isSafeInteger(expectedRawBytes) || expectedRawBytes > limits.maxInflatedBytes) {
    throw new Error(`PNG expanded data exceeds the processing boundary: ${file}`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: expectedRawBytes });
  if (raw.length !== expectedRawBytes) throw new Error(`PNG expanded data length is invalid: ${file}`);
  const rgba = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const scanline = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    unfilter(scanline, previous, filter, channels);
    writeRgba(scanline, rgba, y, width, channels, colorType, palette, paletteAlpha);
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
  if (colorType === 3) return 1;
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

function writeRgba(line, rgba, y, width, channels, colorType, palette = null, paletteAlpha = null) {
  for (let x = 0; x < width; x += 1) {
    const src = x * channels;
    const dst = (y * width + x) * 4;
    if (colorType === 0) {
      rgba[dst] = line[src];
      rgba[dst + 1] = line[src];
      rgba[dst + 2] = line[src];
      rgba[dst + 3] = 255;
    } else if (colorType === 3) {
      const index = line[src];
      const paletteOffset = index * 3;
      if (!palette || paletteOffset + 2 >= palette.length) {
        throw new Error(`PNG palette index ${index} is out of bounds.`);
      }
      rgba[dst] = palette[paletteOffset];
      rgba[dst + 1] = palette[paletteOffset + 1];
      rgba[dst + 2] = palette[paletteOffset + 2];
      rgba[dst + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255;
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

function validateDimensions(width, height, limits, file) {
  const pixels = BigInt(width) * BigInt(height);
  if (width < 1 || height < 1 || width > limits.maxDimension || height > limits.maxDimension
    || pixels > BigInt(limits.maxPixels)) {
    throw new Error(`PNG dimensions exceed the processing boundary: ${file}`);
  }
}

function normalizeReadLimits(options) {
  return {
    maxFileBytes: boundedInteger(options.maxFileBytes, 1024, 1024 * 1024 * 1024, DEFAULT_LIMITS.maxFileBytes),
    maxPixels: boundedInteger(options.maxPixels, 1, 250_000_000, DEFAULT_LIMITS.maxPixels),
    maxDimension: boundedInteger(options.maxDimension, 1, 100_000, DEFAULT_LIMITS.maxDimension),
    maxInflatedBytes: boundedInteger(
      options.maxInflatedBytes,
      1024,
      1024 * 1024 * 1024,
      DEFAULT_LIMITS.maxInflatedBytes
    )
  };
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

module.exports = { readPng, readPngBuffer, writePng, cropPng, withPngReadCache };
