"use strict";

const {
  clamp,
  colorDistance,
  pixel,
  rgbToHex
} = require("@common-tools/slideclone-core/raster-native-detection");

function sampleUniformPageBackgroundFill(image, fallback = "#FFFFFF") {
  if (!image?.rgba || !Number.isFinite(image.width) || !Number.isFinite(image.height)
    || image.width < 8 || image.height < 8) return fallback;
  const anchors = [
    [0.03, 0.03], [0.5, 0.03], [0.97, 0.03],
    [0.03, 0.5], [0.97, 0.5],
    [0.03, 0.97], [0.5, 0.97], [0.97, 0.97]
  ];
  const samples = anchors.map(([nx, ny]) => {
    const cx = Math.round((image.width - 1) * nx);
    const cy = Math.round((image.height - 1) * ny);
    const colors = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        colors.push(pixel(image,
          clamp(cx + dx, 0, image.width - 1),
          clamp(cy + dy, 0, image.height - 1)));
      }
    }
    const median = (channel) => colors
      .map((color) => color[channel])
      .sort((a, b) => a - b)[Math.floor(colors.length / 2)];
    return { r: median("r"), g: median("g"), b: median("b"), a: 255 };
  });
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
