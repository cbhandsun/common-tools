"use strict";

const {
  colorDistance,
  pixel,
  rgbToHex
} = require("@common-tools/slideclone-core/raster-native-detection");

function sampleUniformPageBackgroundFill(image, fallback = "#FFFFFF") {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 8 || image.height < 8 || image.width > 16384 || image.height > 16384
    || !(image.rgba instanceof Uint8Array) || image.rgba.length !== image.width * image.height * 4) return fallback;
  const anchors = [
    [0.01, 0.01], [0.5, 0.01], [0.99, 0.01],
    [0.01, 0.5], [0.99, 0.5],
    [0.01, 0.99], [0.5, 0.99], [0.99, 0.99]
  ];
  const samples = anchors.map(([nx, ny]) => {
    const cx = Math.round((image.width - 1) * nx);
    const cy = Math.round((image.height - 1) * ny);
    const colors = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
        const color = pixel(image, x, y);
        if (color.a >= 160) colors.push(color);
      }
    }
    if (colors.length < 8) return null;
    const median = (channel) => colors
      .map((color) => color[channel])
      .sort((a, b) => a - b)[Math.floor(colors.length / 2)];
    return { r: median("r"), g: median("g"), b: median("b"), a: 255 };
  });
  if (samples.some(color => color === null)) return fallback;
  const channelMedian = (channel) => samples
    .map((color) => color[channel])
    .sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  const candidate = {
    r: channelMedian("r"),
    g: channelMedian("g"),
    b: channelMedian("b"),
    a: 255
  };
  const inliers = samples.filter((color) => colorDistance(color, candidate) <= 24);
  return inliers.length >= 6 ? rgbToHex(candidate) : fallback;
}

module.exports = {
  sampleUniformPageBackgroundFill
};
