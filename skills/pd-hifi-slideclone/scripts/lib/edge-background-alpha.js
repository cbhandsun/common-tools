"use strict";

function makeEdgeConnectedBackgroundTransparent(image, options = {}) {
  if (!validImage(image)) throw new Error("image must contain positive width/height and an RGBA buffer");
  const transparentDistance = finiteNumber(options.transparentDistance, 20);
  const maximumDistance = Math.max(transparentDistance + 1, finiteNumber(options.maximumDistance, 42));
  const background = dominantBorderColor(image, options.quantizationStep);
  const rgba = Buffer.from(image.rgba);
  const pixelCount = image.width * image.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    const pixel = y * image.width + x;
    if (visited[pixel] || colorDistanceAt(rgba, pixel, background) > maximumDistance) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % image.width;
    const y = Math.floor(pixel / image.width);
    const offset = pixel * 4;
    const distance = colorDistanceAt(rgba, pixel, background);
    const alphaRatio = Math.max(0, Math.min(1,
      (distance - transparentDistance) / (maximumDistance - transparentDistance)));
    rgba[offset + 3] = Math.min(rgba[offset + 3], Math.round(255 * alphaRatio));
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < image.width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < image.height) enqueue(x, y + 1);
  }

  return { ...image, rgba };
}

function dominantBorderColor(image, quantizationStep = 16) {
  const step = Math.max(4, Math.min(64, Math.round(finiteNumber(quantizationStep, 16))));
  const buckets = new Map();
  const sample = (x, y) => {
    const offset = (y * image.width + x) * 4;
    if (image.rgba[offset + 3] < 16) return;
    const r = image.rgba[offset];
    const g = image.rgba[offset + 1];
    const b = image.rgba[offset + 2];
    const key = `${Math.floor(r / step)},${Math.floor(g / step)},${Math.floor(b / step)}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  };
  for (let x = 0; x < image.width; x += 1) {
    sample(x, 0);
    if (image.height > 1) sample(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    sample(0, y);
    if (image.width > 1) sample(image.width - 1, y);
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return { r: 255, g: 255, b: 255 };
  return {
    r: winner.r / winner.count,
    g: winner.g / winner.count,
    b: winner.b / winner.count
  };
}

function colorDistanceAt(rgba, pixel, color) {
  const offset = pixel * 4;
  const dr = rgba[offset] - color.r;
  const dg = rgba[offset + 1] - color.g;
  const db = rgba[offset + 2] - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function validImage(image) {
  return Number.isInteger(image?.width)
    && image.width > 0
    && Number.isInteger(image?.height)
    && image.height > 0
    && Buffer.isBuffer(image?.rgba)
    && image.rgba.length === image.width * image.height * 4;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

module.exports = {
  dominantBorderColor,
  makeEdgeConnectedBackgroundTransparent
};
