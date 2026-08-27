"use strict";

const { cropPng } = require("./png");
const { dominantBorderColor, makeEdgeConnectedBackgroundTransparent } = require("./edge-background-alpha");

function refineStandaloneIconCrop(image, options = {}) {
  if (!validImage(image)) throw new Error("image must contain a valid RGBA buffer");
  const paddingPx = positiveInteger(options.paddingPx, 2);
  const minimumDominance = finiteNumber(options.minimumDominance, 0.72);
  const border = dominantBorderColor(image, options.quantizationStep);
  const alphaReady = isNeutralLightBackground(border)
    ? makeEdgeConnectedBackgroundTransparent(image, options)
    : { ...image, rgba: Buffer.from(image.rgba) };
  const components = opaqueComponents(alphaReady, options.minimumAlpha ?? 32);
  if (components.length === 0) return unchanged(alphaReady);

  const primary = components.sort((left, right) => right.pixels.length - left.pixels.length)[0];
  const opaqueCount = components.reduce((sum, component) => sum + component.pixels.length, 0);
  if (primary.pixels.length / opaqueCount < minimumDominance) return unchanged(alphaReady);

  const rgba = Buffer.from(alphaReady.rgba);
  const keep = new Uint8Array(image.width * image.height);
  primary.pixels.forEach((pixel) => { keep[pixel] = 1; });
  for (let pixel = 0; pixel < keep.length; pixel += 1) {
    if (!keep[pixel]) rgba[pixel * 4 + 3] = 0;
  }
  const box = expandBox(primary.box, image.width, image.height, paddingPx);
  return {
    image: cropPng({ ...alphaReady, rgba }, box),
    box,
    refined: true,
    removedNeighborPixels: opaqueCount - primary.pixels.length
  };
}

function opaqueComponents(image, minimumAlpha) {
  const total = image.width * image.height;
  const visited = new Uint8Array(total);
  const components = [];
  for (let seed = 0; seed < total; seed += 1) {
    if (visited[seed] || image.rgba[seed * 4 + 3] < minimumAlpha) continue;
    const pixels = [];
    const queue = [seed];
    visited[seed] = 1;
    let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
    while (queue.length) {
      const pixel = queue.pop();
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      pixels.push(pixel);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const neighbor of neighbors(x, y, image.width, image.height)) {
        if (visited[neighbor] || image.rgba[neighbor * 4 + 3] < minimumAlpha) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    components.push({ pixels, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } });
  }
  return components;
}

function neighbors(x, y, width, height) {
  const result = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
    }
  }
  return result;
}

function isNeutralLightBackground(color = {}) {
  const values = [Number(color.r), Number(color.g), Number(color.b)];
  return values.every(Number.isFinite)
    && Math.max(...values) - Math.min(...values) <= 26
    && (values[0] + values[1] + values[2]) / 3 >= 170;
}

function expandBox(box, width, height, padding) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const right = Math.min(width, box.x + box.w + padding);
  const bottom = Math.min(height, box.y + box.h + padding);
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

function unchanged(image) { return { image, box: { x: 0, y: 0, w: image.width, h: image.height }, refined: false, removedNeighborPixels: 0 }; }
function validImage(image) { return Number.isInteger(image?.width) && image.width > 0 && Number.isInteger(image?.height) && image.height > 0 && Buffer.isBuffer(image?.rgba) && image.rgba.length === image.width * image.height * 4; }
function finiteNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function positiveInteger(value, fallback) { const number = Math.round(Number(value)); return Number.isFinite(number) && number >= 0 ? number : fallback; }

module.exports = { refineStandaloneIconCrop };
