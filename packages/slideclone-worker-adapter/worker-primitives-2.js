"use strict";

const { rasterPixel } = require('./worker-job-support');

function dominantBlockColor(raster, x, y, step) {
  const buckets = new Map();
  for (let yy = y; yy < Math.min(raster.height, y + step); yy += 1) {
    for (let xx = x; xx < Math.min(raster.width, x + step); xx += 1) {
      const color = rasterPixel(raster, xx, yy);
      if (!color || color.a < 128) continue;
      const key = `${Math.round(color.r / 10)},${Math.round(color.g / 10)},${Math.round(color.b / 10)}`;
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += color.r;
      bucket.g += color.g;
      bucket.b += color.b;
      buckets.set(key, bucket);
    }
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return null;
  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
    a: 255
  };
}

module.exports = { dominantBlockColor };
