"use strict";

const crypto = require("node:crypto");

function createVisualFeatureContext(options = {}) {
  const sourceImage = options.sourceImage;
  const slideSize = normalizeSlide(options.slideSize);
  const extractVisualAtoms = options.extractVisualAtoms;
  if (!validRaster(sourceImage)) throw new TypeError("visual feature context requires a bounded raster sourceImage");
  if (!slideSize) throw new TypeError("visual feature context requires a valid slideSize");
  if (typeof extractVisualAtoms !== "function") throw new TypeError("visual feature context requires extractVisualAtoms");
  const maximumEntries = boundedInteger(options.maximumEntries, 512, 1, 10000);
  const visualAtomsByKey = new Map();
  let hits = 0;
  let misses = 0;

  function getVisualAtoms(regionBox, atomOptions = {}) {
    const box = normalizeBox(regionBox);
    if (!box) return [];
    const key = cacheKey(box, atomOptions);
    if (visualAtomsByKey.has(key)) {
      hits += 1;
      return visualAtomsByKey.get(key);
    }
    misses += 1;
    const value = extractVisualAtoms(sourceImage, box, slideSize, atomOptions);
    const atoms = Array.isArray(value) ? value : [];
    if (visualAtomsByKey.size >= maximumEntries) visualAtomsByKey.delete(visualAtomsByKey.keys().next().value);
    visualAtomsByKey.set(key, atoms);
    return atoms;
  }

  function stats() {
    return Object.freeze({ hits, misses, entries: visualAtomsByKey.size, maximumEntries });
  }

  return Object.freeze({ getVisualAtoms, stats });
}

function cacheKey(box, options) {
  const textBoxes = (Array.isArray(options?.textBoxes) ? options.textBoxes : []).slice(0, 512)
    .map((item) => normalizeBox(item?.box))
    .filter(Boolean);
  const semanticHash = crypto.createHash("sha256").update(String(options?.semanticHint || "").slice(0, 2000)).digest("hex").slice(0, 16);
  return JSON.stringify({
    box,
    textBoxes,
    dense: options?.enableDenseLinkedNodes === true,
    semanticHash
  });
}

function validRaster(value) {
  return Boolean(value) && Number.isInteger(value.width) && Number.isInteger(value.height)
    && value.width > 0 && value.height > 0 && value.width * value.height <= 64_000_000;
}

function normalizeSlide(value) {
  const widthPt = Number(value?.widthPt);
  const heightPt = Number(value?.heightPt);
  return Number.isFinite(widthPt) && Number.isFinite(heightPt) && widthPt > 0 && heightPt > 0
    ? Object.freeze({ widthPt, heightPt }) : null;
}

function normalizeBox(value) {
  const numbers = [value?.x, value?.y, value?.w, value?.h].map(Number);
  return numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0 && numbers.every((item) => Math.abs(item) <= 1e7)
    ? { x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] }
    : null;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

module.exports = { createVisualFeatureContext };
