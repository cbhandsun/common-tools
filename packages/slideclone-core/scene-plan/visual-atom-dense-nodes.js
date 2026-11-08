"use strict";

const { clamp, colorDistance, hexToRgb, inAnyMask, luminance, ptToPxBox, round, saturation } = require("./visual-atom-utils");
const { isForegroundPixel } = require("./visual-atom-line-components");
const { DEFAULT_SLIDE } = require("./visual-atom-constants");

function dominantSaturatedForegroundColor(image = {}, region = {}, bg = [255, 255, 255], masks = []) {
  if (!image?.rgba || !region?.w || !region?.h) return null;
  const bins = new Map();
  let sampled = 0;
  const step = Math.max(1, Math.ceil(Math.max(region.w, region.h) / 260));
  for (let y = region.y; y < region.y + region.h; y += step) {
    for (let x = region.x; x < region.x + region.w; x += step) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      const offset = (y * image.width + x) * 4;
      const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
      if (saturation(rgb) < 0.24 || luminance(rgb) < 34 || luminance(rgb) > 235) continue;
      const key = rgb.map((value) => Math.round(value / 24) * 24).join(",");
      const entry = bins.get(key) || { count: 0, sum: [0, 0, 0] };
      entry.count += 1;
      entry.sum[0] += rgb[0];
      entry.sum[1] += rgb[1];
      entry.sum[2] += rgb[2];
      bins.set(key, entry);
      sampled += 1;
    }
  }
  const best = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!best || best.count < 24) return null;
  return {
    rgb: best.sum.map((value) => Math.round(value / best.count)),
    coverageRatio: best.count / Math.max(1, sampled)
  };
}

function detectDenseLinkedNodeAtoms(image = {}, regionBox = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!image?.rgba || !image.width || !image.height || !regionBox?.w || !regionBox?.h) return [];
  const baseRegion = ptToPxBox(regionBox, image, slideSize, 0);
  const ratios = options.subRegionRatios || {};
  const region = {
    x: clamp(Math.floor(baseRegion.x + baseRegion.w * Number(ratios.x || 0)), 0, image.width - 1),
    y: clamp(Math.floor(baseRegion.y + baseRegion.h * Number(ratios.y || 0)), 0, image.height - 1),
    w: clamp(Math.ceil(baseRegion.w * Number(ratios.w || 1)), 1, image.width),
    h: clamp(Math.ceil(baseRegion.h * Number(ratios.h || 1)), 1, image.height)
  };
  region.w = clamp(region.w, 1, image.width - region.x);
  region.h = clamp(region.h, 1, image.height - region.y);
  if (region.w < 12 || region.h < 12) return [];
  const isTargetPixel = typeof options.isTargetPixel === "function"
    ? (x, y) => options.isTargetPixel(image, x, y)
    : targetColorPixelPredicate(image, options);
  const connected = detectDenseLinkedNodeConnectedComponents(image, region, slideSize, isTargetPixel, options);
  const nodes = connected.length >= Number(options.minConnectedNodes || 8)
    ? connected
    : detectDenseLinkedNodeDensityPeaks(image, region, slideSize, isTargetPixel, options);
  return nodes
    .slice(0, Number(options.maxNodes || 28))
    .map((node, index) => ({
      id: `${options.idPrefix || "dense-linked-node"}-${index + 1}`,
      kind: "native-rect-candidate",
      shapeHint: node.kind === "circle" ? "ellipse" : "rect",
      box: {
        x: round(node.x - node.size / 2),
        y: round(node.y - node.size / 2),
        w: round(node.size),
        h: round(node.size)
      },
      center: { x: round(node.x), y: round(node.y) },
      density: node.confidence,
      nativeCandidate: true,
      residualCandidate: false,
      source: {
        detector: "dense-linked-node-atom",
        sourceImageDetected: true,
        method: node.method || "unknown"
      }
    }));
}

function detectDenseLinkedNodeConnectedComponents(image, region, slideSize, isTargetPixel, options = {}) {
  const blueMask = new Uint8Array(region.w * region.h);
  const denseMask = new Uint8Array(region.w * region.h);
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      blueMask[y * region.w + x] = isTargetPixel(region.x + x, region.y + y) ? 1 : 0;
    }
  }
  for (let y = 1; y < region.h - 1; y += 1) {
    for (let x = 1; x < region.w - 1; x += 1) {
      const index = y * region.w + x;
      if (!blueMask[index]) continue;
      const neighbors = blueMask[index - region.w - 1]
        + blueMask[index - region.w]
        + blueMask[index - region.w + 1]
        + blueMask[index - 1]
        + blueMask[index]
        + blueMask[index + 1]
        + blueMask[index + region.w - 1]
        + blueMask[index + region.w]
        + blueMask[index + region.w + 1];
      if (neighbors >= Number(options.minDenseNeighbors || 6)) denseMask[index] = 1;
    }
  }
  const scaleX = image.width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const scaleY = image.height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const visited = new Uint8Array(region.w * region.h);
  const components = [];
  const queue = [];
  for (let startY = 0; startY < region.h; startY += 1) {
    for (let startX = 0; startX < region.w; startX += 1) {
      const startIndex = startY * region.w + startX;
      if (!denseMask[startIndex] || visited[startIndex]) continue;
      visited[startIndex] = 1;
      queue.length = 0;
      queue.push(startIndex);
      let area = 0;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head];
        const x = index % region.w;
        const y = Math.floor(index / region.w);
        area += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const delta of [-1, 1, -region.w, region.w]) {
          const next = index + delta;
          if (next < 0 || next >= denseMask.length || visited[next] || !denseMask[next]) continue;
          if ((delta === -1 && x === 0) || (delta === 1 && x === region.w - 1)) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      const fillRatio = area / Math.max(1, boxW * boxH);
      const slideW = boxW / scaleX;
      const slideH = boxH / scaleY;
      if (area < Number(options.minComponentPixels || 28)
        || slideW < Number(options.minNodeSizePt || 4.5)
        || slideH < Number(options.minNodeSizePt || 4.5)
        || slideW > Number(options.maxNodeSizePt || 24)
        || slideH > Number(options.maxNodeSizePt || 24)
        || fillRatio < Number(options.minFillRatio || 0.34)) continue;
      components.push({
        x: round((region.x + minX + boxW / 2) / scaleX),
        y: round((region.y + minY + boxH / 2) / scaleY),
        size: round(clamp(Math.max(slideW, slideH) + Number(options.nodePadPt || 2.2), Number(options.outputMinSizePt || 7), Number(options.outputMaxSizePt || 15))),
        kind: Math.abs(slideW - slideH) <= 2 && fillRatio > 0.58 ? "circle" : "rect",
        confidence: round(Math.min(0.98, 0.55 + fillRatio * 0.42)),
        method: "connected-component"
      });
    }
  }
  return components.sort((a, b) => a.y - b.y || a.x - b.x);
}

function detectDenseLinkedNodeDensityPeaks(image, region, slideSize, isTargetPixel, options = {}) {
  const scaleX = image.width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const scaleY = image.height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const windowSize = Math.round(clamp(Math.min(scaleX, scaleY) * Number(options.windowSizePt || 11.5), Number(options.minWindowPx || 22), Number(options.maxWindowPx || 34)));
  const step = Math.max(5, Math.round(windowSize * Number(options.windowStepRatio || 0.26)));
  const candidates = [];
  for (let y = region.y; y <= region.y + region.h - windowSize; y += step) {
    for (let x = region.x; x <= region.x + region.w - windowSize; x += step) {
      let targetCount = 0;
      let sumX = 0;
      let sumY = 0;
      let samples = 0;
      for (let yy = 0; yy < windowSize; yy += 2) {
        for (let xx = 0; xx < windowSize; xx += 2) {
          samples += 1;
          if (!isTargetPixel(x + xx, y + yy)) continue;
          targetCount += 1;
          sumX += x + xx;
          sumY += y + yy;
        }
      }
      const density = targetCount / Math.max(1, samples);
      if (density < Number(options.minPeakDensity || 0.42) || targetCount < Number(options.minPeakPixels || 40)) continue;
      candidates.push({ x: sumX / targetCount, y: sumY / targetCount, density, targetCount });
    }
  }
  candidates.sort((a, b) => b.density === a.density ? b.targetCount - a.targetCount : b.density - a.density);
  const kept = [];
  const keptPixels = [];
  const minDistance = Math.max(windowSize * Number(options.nmsWindowRatio || 0.82), Number(options.minNmsDistancePx || 24));
  for (const candidate of candidates) {
    if (keptPixels.some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < minDistance)) continue;
    keptPixels.push({ x: candidate.x, y: candidate.y });
    kept.push({
      x: round(candidate.x / scaleX),
      y: round(candidate.y / scaleY),
      size: round(clamp(windowSize / Math.min(scaleX, scaleY) * Number(options.outputWindowScale || 0.72), Number(options.outputMinSizePt || 7.5), Number(options.outputMaxSizePt || 13.5))),
      kind: "rect",
      confidence: round(Math.min(0.96, 0.56 + candidate.density * 0.38)),
      method: "density-peak"
    });
    if (kept.length >= Number(options.maxNodes || 28)) break;
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

function targetColorPixelPredicate(image = {}, options = {}) {
  const targetRgb = Array.isArray(options.targetRgb)
    ? options.targetRgb
    : hexToRgb(options.targetColor || "#126CB4");
  const tolerance = Number(options.colorTolerance || 92);
  return (x, y) => {
    const offset = (y * image.width + x) * 4;
    return offset >= 0 && colorDistance(targetRgb, [
      image.rgba?.[offset] ?? 255,
      image.rgba?.[offset + 1] ?? 255,
      image.rgba?.[offset + 2] ?? 255
    ]) <= tolerance;
  };
}

module.exports = {
  dominantSaturatedForegroundColor,
  detectDenseLinkedNodeAtoms,
  detectDenseLinkedNodeConnectedComponents,
  detectDenseLinkedNodeDensityPeaks,
  targetColorPixelPredicate
};
