// @ts-check
"use strict";

const { readPng } = require("./png");

const DEFAULT_HASH_SIZE = 8;
const DEFAULT_DCT_SIZE = 32;
const DEFAULT_SSIM_SIZE = 64;
const MAX_IMAGE_DIMENSION = 100000;
const MAX_SAMPLE_DIMENSION = 4096;
const MAX_HASH_BITS = 4096;

/**
 * @typedef {Object} PngImage
 * @property {number} width
 * @property {number} height
 * @property {Buffer} rgba
 */

/**
 * @typedef {Object} PerceptualComparison
 * @property {boolean} passed
 * @property {number} ssim
 * @property {number} phashDistance
 * @property {number} maxPhashDistance
 * @property {number} minSsim
 * @property {string} referenceHash
 * @property {string} candidateHash
 */

/**
 * @param {unknown} source
 * @param {string} [label]
 * @returns {PngImage}
 */
function normalizePngImage(source, label = "image") {
  if (typeof source === "string" && source.trim()) return readPng(source);
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError(`${label} must be a PNG image or file path`);
  const raw = /** @type {Record<string, unknown>} */ (source);
  const width = typeof raw.width === "number" ? raw.width : Number.NaN;
  const height = typeof raw.height === "number" ? raw.height : Number.NaN;
  const rgba = raw.rgba;
  if (!Number.isSafeInteger(width) || width < 1 || width > MAX_IMAGE_DIMENSION) throw new TypeError(`${label}.width must be a positive integer`);
  if (!Number.isSafeInteger(height) || height < 1 || height > MAX_IMAGE_DIMENSION) throw new TypeError(`${label}.height must be a positive integer`);
  if (!Buffer.isBuffer(rgba)) throw new TypeError(`${label}.rgba must be a Buffer`);
  const expectedBytes = width * height * 4;
  if (!Number.isSafeInteger(expectedBytes) || rgba.length !== expectedBytes) throw new TypeError(`${label}.rgba length is invalid`);
  return { width, height, rgba: Buffer.from(rgba) };
}

/**
 * @param {unknown} reference
 * @param {unknown} candidate
 * @param {{ minSsim?: number, maxPhashDistance?: number }} [options]
 * @returns {PerceptualComparison}
 */
function comparePerceptualImages(reference, candidate, options = {}) {
  const referenceImage = normalizePngImage(reference, "reference image");
  const candidateImage = normalizePngImage(candidate, "candidate image");
  const rawOptions = optionalRecord(options, "options");
  const minSsim = boundedRatio(rawOptions.minSsim, 0.92, "minSsim");
  const maxPhashDistance = boundedInteger(rawOptions.maxPhashDistance, 8, 0, 63, "maxPhashDistance");

  const referenceHashBits = perceptualHashBits(referenceImage);
  const candidateHashBits = perceptualHashBits(candidateImage);
  const phashDistance = hammingDistance(referenceHashBits, candidateHashBits);
  const ssim = structuralSimilarity(referenceImage, candidateImage);
  const passed = ssim >= minSsim && phashDistance <= maxPhashDistance;

  return Object.freeze({
    passed,
    ssim,
    phashDistance,
    maxPhashDistance,
    minSsim,
    referenceHash: hashBitsToHex(referenceHashBits),
    candidateHash: hashBitsToHex(candidateHashBits)
  });
}

/**
 * @param {PngImage} image
 * @returns {readonly boolean[]}
 */
function perceptualHashBits(image) {
  const normalized = normalizePngImage(image, "image");
  const values = sampleGrayscale(normalized, DEFAULT_DCT_SIZE, DEFAULT_DCT_SIZE);
  /** @type {number[]} */
  const coefficients = [];
  for (let v = 0; v < DEFAULT_HASH_SIZE; v += 1) {
    for (let u = 0; u < DEFAULT_HASH_SIZE; u += 1) {
      if (u === 0 && v === 0) continue;
      coefficients.push(dctCoefficient(values, DEFAULT_DCT_SIZE, DEFAULT_DCT_SIZE, u, v));
    }
  }
  const median = medianNumber(coefficients);
  return Object.freeze(coefficients.map((value) => value >= median));
}

/**
 * @param {PngImage} reference
 * @param {PngImage} candidate
 * @returns {number}
 */
function structuralSimilarity(reference, candidate) {
  const referenceImage = normalizePngImage(reference, "reference image");
  const candidateImage = normalizePngImage(candidate, "candidate image");
  const a = sampleGrayscale(referenceImage, DEFAULT_SSIM_SIZE, DEFAULT_SSIM_SIZE);
  const b = sampleGrayscale(candidateImage, DEFAULT_SSIM_SIZE, DEFAULT_SSIM_SIZE);
  const count = a.length;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < count; i += 1) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= count;
  meanB /= count;

  let varianceA = 0;
  let varianceB = 0;
  let covariance = 0;
  for (let i = 0; i < count; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    varianceA += da * da;
    varianceB += db * db;
    covariance += da * db;
  }
  const divisor = Math.max(1, count - 1);
  varianceA /= divisor;
  varianceB /= divisor;
  covariance /= divisor;

  const c1 = 6.5025;
  const c2 = 58.5225;
  const numerator = (2 * meanA * meanB + c1) * (2 * covariance + c2);
  const denominator = (meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2);
  const ssim = denominator === 0 ? 1 : numerator / denominator;
  return Math.round(Math.max(0, Math.min(1, ssim)) * 1000000) / 1000000;
}

/**
 * @param {PngImage} image
 * @param {number} width
 * @param {number} height
 * @returns {number[]}
 */
function sampleGrayscale(image, width, height) {
  const normalized = normalizePngImage(image, "image");
  const sampleWidth = boundedRequiredInteger(width, 1, MAX_SAMPLE_DIMENSION, "sample width");
  const sampleHeight = boundedRequiredInteger(height, 1, MAX_SAMPLE_DIMENSION, "sample height");
  /** @type {number[]} */
  const values = [];
  for (let y = 0; y < sampleHeight; y += 1) {
    const sourceY = Math.min(normalized.height - 1, Math.floor(((y + 0.5) * normalized.height) / sampleHeight));
    for (let x = 0; x < sampleWidth; x += 1) {
      const sourceX = Math.min(normalized.width - 1, Math.floor(((x + 0.5) * normalized.width) / sampleWidth));
      const offset = (sourceY * normalized.width + sourceX) * 4;
      const alpha = (normalized.rgba[offset + 3] || 0) / 255;
      const r = compositeChannel(normalized.rgba[offset], alpha);
      const g = compositeChannel(normalized.rgba[offset + 1], alpha);
      const b = compositeChannel(normalized.rgba[offset + 2], alpha);
      values.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }
  return values;
}

/**
 * @param {number | undefined} value
 * @param {number} alpha
 * @returns {number}
 */
function compositeChannel(value, alpha) {
  const channel = value == null ? 255 : value;
  return channel * alpha + 255 * (1 - alpha);
}

/**
 * @param {readonly number[]} values
 * @param {number} width
 * @param {number} height
 * @param {number} u
 * @param {number} v
 * @returns {number}
 */
function dctCoefficient(values, width, height, u, v) {
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    const cosY = Math.cos(((2 * y + 1) * v * Math.PI) / (2 * height));
    for (let x = 0; x < width; x += 1) {
      const cosX = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * width));
      sum += values[y * width + x] * cosX * cosY;
    }
  }
  const au = u === 0 ? Math.sqrt(1 / width) : Math.sqrt(2 / width);
  const av = v === 0 ? Math.sqrt(1 / height) : Math.sqrt(2 / height);
  return au * av * sum;
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function medianNumber(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * @param {readonly boolean[]} a
 * @param {readonly boolean[]} b
 * @returns {number}
 */
function hammingDistance(a, b) {
  validateHashBits(a, "left hash bits");
  validateHashBits(b, "right hash bits");
  if (a.length !== b.length) throw new TypeError("hash bit arrays must have equal length");
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
}

/**
 * @param {readonly boolean[]} bits
 * @returns {string}
 */
function hashBitsToHex(bits) {
  validateHashBits(bits, "hash bits");
  let out = "";
  for (let i = 0; i < bits.length; i += 4) {
    let value = 0;
    for (let j = 0; j < 4; j += 1) {
      value = (value << 1) | (bits[i + j] ? 1 : 0);
    }
    out += value.toString(16);
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function optionalRecord(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function validateHashBits(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length < 1 || value.length > MAX_HASH_BITS) throw new RangeError(`${label} length must be between 1 and ${MAX_HASH_BITS}`);
  value.forEach((bit, index) => {
    if (typeof bit !== "boolean") throw new TypeError(`${label}[${index}] must be a boolean`);
  });
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function boundedRatio(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${label} must be a number between 0 and 1`);
  return number;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 * @param {string} label
 * @returns {number}
 */
function boundedInteger(value, fallback, min, max, label) {
  if (value === undefined || value === null) return fallback;
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(number) || number < min || number > max) throw new TypeError(`${label} must be an integer between ${min} and ${max}`);
  return number;
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {string} label
 * @returns {number}
 */
function boundedRequiredInteger(value, min, max, label) {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(number) || number < min || number > max) throw new TypeError(`${label} must be an integer between ${min} and ${max}`);
  return number;
}

module.exports = {
  comparePerceptualImages,
  hammingDistance,
  hashBitsToHex,
  normalizePngImage,
  optionalRecord,
  perceptualHashBits,
  sampleGrayscale,
  structuralSimilarity,
  boundedRequiredInteger,
  validateHashBits
};
