// @ts-check
"use strict";
const { averageColor, colorDistance, pixel, pxToPtBox, rgbToHex } = require("./raster-native-detection");
/** @param {{width:number,height:number,rgba:Uint8Array}} source @param {{widthPt:number,heightPt:number}} slideSize @param {number} [existingShapeCount] */
function detectSolidVisualFallbackRectangles(source, slideSize, existingShapeCount = 0) {
  const step = Math.max(2, Math.round(Math.sqrt((source.width * source.height) / 180000)));
  const gridW = Math.ceil(source.width / step);
  const gridH = Math.ceil(source.height / step);
  const visited = new Uint8Array(gridW * gridH);
  const components = [];
  for (let gy = 0; gy < gridH; gy += 1) {
    for (let gx = 0; gx < gridW; gx += 1) {
      const start = gy * gridW + gx;
      if (visited[start]) continue;
      const sx = Math.min(source.width - 1, gx * step);
      const sy = Math.min(source.height - 1, gy * step);
      const seed = pixel(source, sx, sy);
      if (!isSolidFallbackSeed(seed)) {
        visited[start] = 1;
        continue;
      }
      /** @type {[number,number][]} */ const queue = [[gx, gy]];
      /** @type {import("./raster-native-detection").RGBA[]} */ const colors = [];
      visited[start] = 1;
      let qi = 0;
      let count = 0;
      let minGX = gx;
      let maxGX = gx;
      let minGY = gy;
      let maxGY = gy;
      while (qi < queue.length && count < gridW * gridH) {
        const [cx, cy] = /** @type {[number,number]} */ (queue[qi++]);
        const color = pixel(source, Math.min(source.width - 1, cx * step), Math.min(source.height - 1, cy * step));
        count += 1;
        if (colors.length < 400) colors.push(color);
        minGX = Math.min(minGX, cx);
        maxGX = Math.max(maxGX, cx);
        minGY = Math.min(minGY, cy);
        maxGY = Math.max(maxGY, cy);
        for (const [nx, ny] of /** @type {[number,number][]} */ ([[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]])) {
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
          const nextIndex = ny * gridW + nx;
          if (visited[nextIndex]) continue;
          const next = pixel(source, Math.min(source.width - 1, nx * step), Math.min(source.height - 1, ny * step));
          if (!isSolidFallbackNeighbor(seed, next)) {
            visited[nextIndex] = 1;
            continue;
          }
          visited[nextIndex] = 1;
          queue.push([nx, ny]);
        }
      }
      const box = {
        x: minGX * step,
        y: minGY * step,
        w: Math.min(source.width, (maxGX + 1) * step) - minGX * step,
        h: Math.min(source.height, (maxGY + 1) * step) - minGY * step
      };
      const area = box.w * box.h;
      const density = count * step * step / Math.max(1, area);
      if (density < 0.58 || area < source.width * source.height * 0.008 || area > source.width * source.height * 0.48) continue;
      const ptBox = pxToPtBox(box, source, slideSize, 0);
      if (ptBox.w < 28 || ptBox.h < 18) continue;
      const aspect = ptBox.w / Math.max(1, ptBox.h);
      if (aspect > 22 || aspect < 0.045) continue;
      components.push({
        id: `visual-fallback-solid-region-${existingShapeCount + components.length + 1}`,
        type: "rect",
        box: ptBox,
        style: { fill: rgbToHex(averageColor(colors)), stroke: "none", strokeWidthPt: 0, opacity: 1 },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "visual-fallback-solid-region",
          componentQualityIgnore: true,
          retainedInVisualFallback: true,
          visualFallbackPrimitive: true
        }
      });
    }
  }
  return components.sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h)).slice(0, 48);
}

/** @param {import("./raster-native-detection").RGBA} color */
function isSolidFallbackSeed(color) {
  if (!color || color.a < 64) return false;
  if (color.r > 246 && color.g > 246 && color.b > 246) return false;
  if (color.r < 28 && color.g < 28 && color.b < 28) return false;
  return true;
}

/** @param {import("./raster-native-detection").RGBA} seed @param {import("./raster-native-detection").RGBA} next */
function isSolidFallbackNeighbor(seed, next) {
  if (!isSolidFallbackSeed(next)) return false;
  return colorDistance(seed, next) <= 28;
}

module.exports = { detectSolidVisualFallbackRectangles };
