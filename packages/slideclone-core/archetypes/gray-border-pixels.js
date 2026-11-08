"use strict";
// @ts-check

/** @typedef {{width:number,height:number,rgba:Uint8Array}} RgbaImage */
/** @typedef {{x:number,y:number,w:number,h:number}} LayerBox */
/** @typedef {{left:number,right:number,top:number,bottom:number}} Border */

const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 16_384;
const MAX_BORDERS = 128;
const MAX_SAMPLES = 20_000_000;

/**
 * Erases only source-owned, straight gray border pixels from a raster layer.
 * The supplied border coordinates are source-image pixel coordinates.
 *
 * @param {unknown} input
 * @returns {{image:RgbaImage,changedPixels:number}}
 */
function cleanGrayBorderPixels(input) {
  if (!isRecord(input)) throw new TypeError("Invalid gray border pixel request");
  const sourceImage = parseImage(input.sourceImage, "source");
  const layerImage = parseImage(input.layerImage, "layer");
  const layerBox = parseLayerBox(input.layerBox);
  const slideSize = parseSlideSize(input.slideSize);
  const borders = parseBorders(input.borders, sourceImage);

  if (layerBox.x > slideSize.widthPt || layerBox.y > slideSize.heightPt
    || layerBox.w > slideSize.widthPt - layerBox.x
    || layerBox.h > slideSize.heightPt - layerBox.y) {
    throw new RangeError("Gray border pixel layer box is outside the slide");
  }
  const sx = sourceImage.width / slideSize.widthPt;
  const sy = sourceImage.height / slideSize.heightPt;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) throw new TypeError("Invalid gray border pixel slide size");

  if (borders.length === 0) return { image: layerImage, changedPixels: 0 };
  const samples = layerImage.width * layerImage.height;
  if (samples * borders.length > MAX_SAMPLES) throw new RangeError("Gray border pixel sampling limit exceeded");

  /** @type {Uint8Array|undefined} */ let cleaned;
  let changedPixels = 0;
  for (let y = 0; y < layerImage.height; y += 1) {
    for (let x = 0; x < layerImage.width; x += 1) {
      const sourceX = Math.floor((layerBox.x + (x + 0.5) * layerBox.w / layerImage.width) * sx);
      const sourceY = Math.floor((layerBox.y + (y + 0.5) * layerBox.h / layerImage.height) * sy);
      if (sourceX < 0 || sourceY < 0 || sourceX >= sourceImage.width || sourceY >= sourceImage.height) continue;
      const layerOffset = (y * layerImage.width + x) * 4;
      if (!isOwnedByBorder(sourceX, sourceY, borders)
        || !isGray(sourceImage.rgba, (sourceY * sourceImage.width + sourceX) * 4)
        || !isGray(layerImage.rgba, layerOffset)) continue;
      if (!cleaned) cleaned = new Uint8Array(layerImage.rgba);
      cleaned.fill(255, layerOffset, layerOffset + 4);
      changedPixels += 1;
    }
  }
  return cleaned
    ? { image: { width: layerImage.width, height: layerImage.height, rgba: cleaned }, changedPixels }
    : { image: layerImage, changedPixels: 0 };
}

/** @param {number} x @param {number} y @param {Border[]} borders */
function isOwnedByBorder(x, y, borders) {
  for (const border of borders) {
    if (((Math.abs(x - border.left) <= 2 || Math.abs(x - border.right) <= 2)
      && y > border.top + 10 && y < border.bottom - 10)
      || ((Math.abs(y - border.top) <= 2 || Math.abs(y - border.bottom) <= 2)
      && x > border.left + 10 && x < border.right - 10)) return true;
  }
  return false;
}

/** @param {Uint8Array} rgba @param {number} offset */
function isGray(rgba, offset) {
  const red = rgba[offset] ?? 0; const green = rgba[offset + 1] ?? 0; const blue = rgba[offset + 2] ?? 0;
  return (rgba[offset + 3] ?? 0) >= 160
    && Math.max(red, green, blue) - Math.min(red, green, blue) < 25
    && red > 80 && red < 225;
}

/** @param {unknown} value @param {string} name @returns {RgbaImage} */
function parseImage(value, name) {
  if (!isRecord(value)) throw new TypeError("Invalid gray border pixel " + name + " image");
  const image = /** @type {RgbaImage} */ (value);
  const width = image.width; const height = image.height; const rgba = image.rgba;
  if (!isDimension(width) || !isDimension(height) || width * height > MAX_PIXELS
    || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
    throw new TypeError("Invalid gray border pixel " + name + " image");
  }
  return image;
}

/** @param {unknown} value @returns {LayerBox} */
function parseLayerBox(value) {
  if (!isRecord(value)) throw new TypeError("Invalid gray border pixel layer box");
  const x = value.x; const y = value.y; const w = value.w; const h = value.h;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)
    || x < 0 || y < 0 || w <= 0 || h <= 0) throw new TypeError("Invalid gray border pixel layer box");
  return { x, y, w, h };
}

/** @param {unknown} value @returns {{widthPt:number,heightPt:number}} */
function parseSlideSize(value) {
  if (!isRecord(value) || !isFiniteNumber(value.widthPt) || !isFiniteNumber(value.heightPt)
    || value.widthPt <= 0.000001 || value.heightPt <= 0.000001) throw new TypeError("Invalid gray border pixel slide size");
  return { widthPt: value.widthPt, heightPt: value.heightPt };
}

/** @param {unknown} value @param {RgbaImage} sourceImage @returns {Border[]} */
function parseBorders(value, sourceImage) {
  if (!Array.isArray(value)) throw new TypeError("Invalid gray border pixel borders");
  if (value.length > MAX_BORDERS) throw new RangeError("Too many gray border pixel borders");
  return value.map((candidate) => parseBorder(candidate, sourceImage));
}

/** @param {unknown} value @param {RgbaImage} sourceImage @returns {Border} */
function parseBorder(value, sourceImage) {
  if (!isRecord(value)) throw new TypeError("Invalid gray border pixel border");
  const left = value.left; const right = value.right; const top = value.top; const bottom = value.bottom;
  if (!isPixelCoordinate(left) || !isPixelCoordinate(right) || !isPixelCoordinate(top) || !isPixelCoordinate(bottom)
    || left >= right || top >= bottom || right >= sourceImage.width || bottom >= sourceImage.height) {
    throw new TypeError("Invalid gray border pixel border");
  }
  return { left, right, top, bottom };
}

/** @param {unknown} value @returns {value is number} */
function isDimension(value) { return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_DIMENSION; }
/** @param {unknown} value @returns {value is number} */
function isPixelCoordinate(value) { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }

module.exports = { cleanGrayBorderPixels };
