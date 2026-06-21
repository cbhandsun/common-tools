"use strict";

const path = require("path");
const { readPng, writePng, cropPng } = require("./png");

function proposeRegions(image, options = {}) {
  const minAreaRatio = options.minAreaRatio ?? 0.035;
  const maxAreaRatio = options.maxAreaRatio ?? 0.72;
  const minWidthRatio = options.minWidthRatio ?? 0.16;
  const minHeightRatio = options.minHeightRatio ?? 0.16;
  const stride = options.stride ?? 2;
  const maskWidth = Math.ceil(image.width / stride);
  const maskHeight = Math.ceil(image.height / stride);
  const mask = new Uint8Array(maskWidth * maskHeight);
  const neutralPanelMask = new Uint8Array(maskWidth * maskHeight);

  for (let my = 0; my < maskHeight; my += 1) {
    for (let mx = 0; mx < maskWidth; mx += 1) {
      const x = Math.min(image.width - 1, mx * stride);
      const y = Math.min(image.height - 1, my * stride);
      if (isCandidatePixel(image, x, y)) {
        mask[my * maskWidth + mx] = 1;
      }
      if (isNeutralPanelPixel(image, x, y)) {
        neutralPanelMask[my * maskWidth + mx] = 1;
      }
    }
  }

  const rawCandidates = [
    ...connectedComponents(mask, maskWidth, maskHeight, stride).map((box) => ({
      box,
      reason: "Large bright embedded panel detected by border/background contrast."
    })),
    ...connectedComponents(neutralPanelMask, maskWidth, maskHeight, stride).map((box) => ({
      box,
      reason: "Large neutral panel detected as a likely embedded screenshot/card."
    }))
  ];

  const components = rawCandidates
    .map((candidate) => ({
      ...candidate,
      box: expandBox(candidate.box, image.width, image.height, options.paddingPx ?? 4)
    }))
    .filter((candidate) => {
      const areaRatio = (candidate.box.w * candidate.box.h) / (image.width * image.height);
      return areaRatio >= minAreaRatio
        && areaRatio <= maxAreaRatio
        && candidate.box.w / image.width >= minWidthRatio
        && candidate.box.h / image.height >= minHeightRatio
        && candidate.box.x > 4
        && candidate.box.y > 4
        && candidate.box.x + candidate.box.w < image.width - 4
        && candidate.box.y + candidate.box.h < image.height - 4;
    })
    .map((candidate) => refineCandidate(image, candidate, options))
    .filter((region) => region.confidence >= (options.minConfidence ?? 0.45))
    .sort((a, b) => b.confidence - a.confidence);

  return suppressOverlaps(components);
}

function refineCandidate(image, candidate, options) {
  const innerContentBox = options.cropContainer !== true
    ? findInnerContentBox(image, candidate.box, options)
    : null;
  const box = innerContentBox || candidate.box;
  const type = classifyRegion(image, box);
  const confidence = innerContentBox
    ? Math.min(0.98, scoreRegion(image, box) + 0.22)
    : scoreRegion(image, box);
  return {
    type,
    box,
    containerBox: innerContentBox ? candidate.box : undefined,
    confidence,
    strategy: "crop-as-image + editable-overlay",
    reason: innerContentBox
      ? `${candidate.reason} Inner embedded content was selected instead of the outer card.`
      : candidate.reason
  };
}

function cropRegions(sourceFile, outputDir, options = {}) {
  const image = readPng(sourceFile);
  const regions = proposeRegions(image, options);
  return regions.map((region, index) => {
    const cleanBox = trimAnnotationBorder(image, region.box);
    const crop = cropPng(image, cleanBox);
    const file = path.join(outputDir, `${path.basename(sourceFile, path.extname(sourceFile))}.region-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      ...region,
      box: cleanBox,
      detectedBox: region.box,
      sourceImage: file,
      originalSource: sourceFile,
      widthPx: crop.width,
      heightPx: crop.height
    };
  });
}

function trimAnnotationBorder(image, box) {
  let { x, y, w, h } = box;
  const maxTrim = Math.max(8, Math.floor(Math.min(w, h) * 0.04));
  const left = findAnnotationInset(image, box, "left", maxTrim);
  const right = findAnnotationInset(image, box, "right", maxTrim);
  const top = findAnnotationInset(image, box, "top", maxTrim);
  const bottom = findAnnotationInset(image, box, "bottom", maxTrim);
  return {
    x: x + left,
    y: y + top,
    w: Math.max(1, w - left - right),
    h: Math.max(1, h - top - bottom)
  };
}

function findAnnotationInset(image, box, side, maxTrim) {
  const threshold = 0.35;
  let firstRed = -1;
  let lastRed = -1;
  for (let offset = 0; offset < maxTrim; offset += 1) {
    const ratio = side === "left"
      ? redEdgeRatio(image, box.x + offset, box.y, 1, box.h)
      : side === "right"
        ? redEdgeRatio(image, box.x + box.w - 1 - offset, box.y, 1, box.h)
        : side === "top"
          ? redEdgeRatio(image, box.x, box.y + offset, box.w, 1)
          : redEdgeRatio(image, box.x, box.y + box.h - 1 - offset, box.w, 1);
    if (ratio > threshold) {
      if (firstRed === -1) firstRed = offset;
      lastRed = offset;
      continue;
    }
    if (firstRed !== -1 && offset - lastRed > 2) break;
  }
  return lastRed === -1 ? 0 : Math.min(maxTrim, lastRed + 1);
}

function redEdgeRatio(image, x, y, w, h) {
  let red = 0;
  let total = 0;
  for (let yy = Math.max(0, y); yy < Math.min(image.height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(image.width, x + w); xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      total += 1;
      if (r > 170 && g < 120 && b < 120 && r > g * 1.6 && r > b * 1.6) red += 1;
    }
  }
  return total ? red / total : 0;
}

function isCandidatePixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  const r = image.rgba[offset];
  const g = image.rgba[offset + 1];
  const b = image.rgba[offset + 2];
  const a = image.rgba[offset + 3];
  if (a < 240) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness >= 214 && max - min <= 28;
}

function isNeutralPanelPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  const r = image.rgba[offset];
  const g = image.rgba[offset + 1];
  const b = image.rgba[offset + 2];
  const a = image.rgba[offset + 3];
  if (a < 240) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness >= 185 && brightness <= 247 && max - min <= 32;
}

function findInnerContentBox(image, container, options = {}) {
  const stride = options.innerStride ?? 2;
  const headerRatio = options.innerHeaderSkipRatio ?? 0.18;
  const search = {
    x: container.x + Math.floor(container.w * 0.04),
    y: container.y + Math.floor(container.h * headerRatio),
    w: Math.floor(container.w * 0.92),
    h: Math.floor(container.h * (1 - headerRatio - 0.06))
  };
  if (search.w <= 0 || search.h <= 0) return null;

  const maskWidth = Math.ceil(search.w / stride);
  const maskHeight = Math.ceil(search.h / stride);
  const mask = new Uint8Array(maskWidth * maskHeight);
  for (let my = 0; my < maskHeight; my += 1) {
    for (let mx = 0; mx < maskWidth; mx += 1) {
      const x = Math.min(image.width - 1, search.x + mx * stride);
      const y = Math.min(image.height - 1, search.y + my * stride);
      if (isInnerContentPixel(image, x, y)) {
        mask[my * maskWidth + mx] = 1;
      }
    }
  }

  const components = connectedComponents(mask, maskWidth, maskHeight, stride)
    .map((box) => ({
      x: box.x + search.x,
      y: box.y + search.y,
      w: box.w,
      h: box.h
    }))
    .filter((box) => {
      const areaRatio = (box.w * box.h) / Math.max(1, container.w * container.h);
      const touchesContainer = box.x <= container.x + 8
        || box.y <= container.y + 8
        || box.x + box.w >= container.x + container.w - 8
        || box.y + box.h >= container.y + container.h - 8;
      return !touchesContainer
        && areaRatio >= 0.004
        && box.y >= container.y + container.h * 0.16
        && box.w >= container.w * 0.08
        && box.h >= container.h * 0.05;
    });

  if (components.length === 0) return null;
  const union = components.reduce((acc, box) => unionBox(acc, box), null);
  if (!union) return null;
  const padded = expandBox(union, image.width, image.height, options.innerPaddingPx ?? 4);
  const innerAreaRatio = (padded.w * padded.h) / Math.max(1, container.w * container.h);
  if (innerAreaRatio < 0.03 || innerAreaRatio > 0.78) return null;
  return padded;
}

function isInnerContentPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  const r = image.rgba[offset];
  const g = image.rgba[offset + 1];
  const b = image.rgba[offset + 2];
  const a = image.rgba[offset + 3];
  if (a < 240) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness >= 248 && max - min <= 16;
}

function connectedComponents(mask, width, height, stride) {
  const visited = new Uint8Array(mask.length);
  const boxes = [];
  const queue = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx] || visited[idx]) continue;
      visited[idx] = 1;
      queue.length = 0;
      queue.push([x, y]);
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      for (let i = 0; i < queue.length; i += 1) {
        const [cx, cy] = queue[i];
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nidx = ny * width + nx;
          if (!mask[nidx] || visited[nidx]) continue;
          visited[nidx] = 1;
          queue.push([nx, ny]);
        }
      }
      boxes.push({
        x: minX * stride,
        y: minY * stride,
        w: (maxX - minX + 1) * stride,
        h: (maxY - minY + 1) * stride
      });
    }
  }
  return boxes;
}

function expandBox(box, width, height, padding) {
  const x = Math.max(0, box.x - padding);
  const y = Math.max(0, box.y - padding);
  const right = Math.min(width, box.x + box.w + padding);
  const bottom = Math.min(height, box.y + box.h + padding);
  return { x, y, w: right - x, h: bottom - y };
}

function scoreRegion(image, box) {
  const areaRatio = (box.w * box.h) / (image.width * image.height);
  const aspect = box.w / Math.max(1, box.h);
  const aspectScore = aspect >= 0.45 && aspect <= 2.4 ? 0.22 : 0.08;
  const sizeScore = Math.min(0.4, areaRatio * 2.2);
  const edgeScore = borderContrastScore(image, box) * 0.3;
  const contentScore = innerInkScore(image, box) * 0.18;
  return Math.min(0.98, sizeScore + aspectScore + edgeScore + contentScore);
}

function borderContrastScore(image, box) {
  const inner = sampleBrightness(image, box.x + box.w * 0.5, box.y + box.h * 0.5);
  const outer = [
    sampleBrightness(image, box.x - 4, box.y + box.h * 0.5),
    sampleBrightness(image, box.x + box.w + 4, box.y + box.h * 0.5),
    sampleBrightness(image, box.x + box.w * 0.5, box.y - 4),
    sampleBrightness(image, box.x + box.w * 0.5, box.y + box.h + 4)
  ].filter((value) => value !== null);
  if (outer.length === 0) return 0.4;
  const outerAvg = outer.reduce((a, b) => a + b, 0) / outer.length;
  return Math.max(0, Math.min(1, Math.abs(inner - outerAvg) / 45));
}

function innerInkScore(image, box) {
  let dark = 0;
  let total = 0;
  const step = Math.max(2, Math.floor(Math.min(box.w, box.h) / 60));
  for (let y = box.y + step; y < box.y + box.h - step; y += step) {
    for (let x = box.x + step; x < box.x + box.w - step; x += step) {
      const brightness = sampleBrightness(image, x, y);
      if (brightness === null) continue;
      total += 1;
      if (brightness < 190) dark += 1;
    }
  }
  if (!total) return 0;
  const ratio = dark / total;
  return ratio > 0.015 && ratio < 0.42 ? 1 : Math.min(1, ratio / 0.015);
}

function sampleBrightness(image, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (y * image.width + x) * 4;
  return (image.rgba[offset] + image.rgba[offset + 1] + image.rgba[offset + 2]) / 3;
}

function classifyRegion(image, box) {
  const aspect = box.w / Math.max(1, box.h);
  const color = colorStats(image, box);
  if (color.blueRatio > 0.005) return "embedded-ui-screenshot";
  if (aspect > 1.15) return "embedded-ui-screenshot";
  return "embedded-document-screenshot";
}

function colorStats(image, box) {
  let blue = 0;
  let total = 0;
  const step = Math.max(2, Math.floor(Math.min(box.w, box.h) / 120));
  for (let y = box.y; y < box.y + box.h; y += step) {
    for (let x = box.x; x < box.x + box.w; x += step) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const offset = (y * image.width + x) * 4;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      total += 1;
      if (b > 110 && b > r + 25 && b > g + 5) blue += 1;
    }
  }
  return {
    blueRatio: total ? blue / total : 0
  };
}

function suppressOverlaps(regions) {
  const kept = [];
  for (const region of regions) {
    if (kept.some((item) => iou(item.box, region.box) > 0.62)) continue;
    kept.push(region);
  }
  return kept.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union ? intersection / union : 0;
}

function unionBox(a, b) {
  if (!a) return { ...b };
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function overlapRatio(a1, a2, b1, b2) {
  const overlap = Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const base = Math.max(1, Math.min(a2 - a1, b2 - b1));
  return overlap / base;
}

module.exports = { proposeRegions, cropRegions };
