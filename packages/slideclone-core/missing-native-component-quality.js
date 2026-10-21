"use strict";

const MAX_COMPONENTS = 80;
const MIN_PIXELS = 24;
const MAX_DIMENSION = 16384;

function detectMissingNativeComponentRegions(source, generated, regions = [], slideSize, options = {}) {
  validateImage(source);
  validateImage(generated);
  if (!validSlideSize(slideSize) || !Array.isArray(regions)) return [];
  const threshold = boundedNumber(options.threshold, 24, 0, 255);
  const tolerance = Math.floor(boundedNumber(options.foregroundTolerancePx, 2, 0, 8));
  const toleranceDelta = boundedNumber(options.foregroundToleranceDelta, 54, 0, 255);
  const textRegions = regions.filter((region) => region?.kind === "text" && validBox(region?.box));
  const mask = buildCoveredMask(source, regions, slideSize);
  const visited = new Uint8Array(source.width * source.height);
  const candidates = [];
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = y * source.width + x;
      if (visited[index] || mask[index]) continue;
      if (!isMissingForeground(source, generated, x, y, { threshold, tolerance, toleranceDelta })) {
        visited[index] = 1;
        continue;
      }
      const component = floodMissingComponent(source, generated, x, y, visited, mask, { threshold, tolerance, toleranceDelta });
      if (component.pixelCount >= MIN_PIXELS) candidates.push(component);
    }
  }
  return candidates
    .filter((item) => isUsefulMissingComponent(item, source))
    .sort((left, right) => right.pixelCount - left.pixelCount || left.y - right.y || left.x - right.x)
    .slice(0, MAX_COMPONENTS)
    .map((item, index) => missingRegion(item, index, source, slideSize, textRegions));
}

function floodMissingComponent(source, generated, startX, startY, visited, mask, options) {
  const queue = [[startX, startY]];
  visited[startY * source.width + startX] = 1;
  let cursor = 0;
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  let pixelCount = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  while (cursor < queue.length) {
    const [x, y] = queue[cursor];
    cursor += 1;
    const offset = (y * source.width + x) * 4;
    pixelCount += 1;
    r += source.rgba[offset];
    g += source.rgba[offset + 1];
    b += source.rgba[offset + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    for (const [nx, ny] of neighborPixels(x, y)) {
      if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
      const nextIndex = ny * source.width + nx;
      if (visited[nextIndex] || mask[nextIndex]) continue;
      if (!isMissingForeground(source, generated, nx, ny, options)) {
        visited[nextIndex] = 1;
        continue;
      }
      visited[nextIndex] = 1;
      queue.push([nx, ny]);
    }
  }
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    pixelCount,
    color: rgbToHex(r / pixelCount, g / pixelCount, b / pixelCount),
    density: pixelCount / Math.max(1, area)
  };
}

function neighborPixels(x, y) {
  return [
    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
    [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]
  ];
}

function isUsefulMissingComponent(component, source) {
  const area = component.w * component.h;
  const pageArea = source.width * source.height;
  if (component.w < 3 || component.h < 3 || area < MIN_PIXELS) return false;
  if (area > pageArea * 0.08) return false;
  const density = component.pixelCount / Math.max(1, area);
  if (density < 0.015) return false;
  return true;
}

function missingRegion(component, index, source, slideSize, textRegions) {
  const box = {
    x: component.x * slideSize.widthPt / source.width,
    y: component.y * slideSize.heightPt / source.height,
    w: component.w * slideSize.widthPt / source.width,
    h: component.h * slideSize.heightPt / source.height
  };
  const rounded = roundBox(box);
  const textAdjacency = missingNativeTextAdjacency(rounded, textRegions);
  return Object.freeze({
    id: `missing-native-component-${String(index + 1).padStart(3, "0")}`,
    kind: "missing",
    role: "missing-native-component",
    box: Object.freeze(rounded),
    ...(textAdjacency ? { textAdjacent: true, repairHint: "text", nearestTextId: textAdjacency.id, nearestTextDistancePt: textAdjacency.distancePt } : {}),
    source: Object.freeze({
      detector: "missing-native-component-quality",
      dominantColor: component.color,
      missingForegroundPixels: component.pixelCount,
      missingPixelDensity: Math.round(component.density * 10000) / 10000,
      missingComponentFingerprint: missingComponentFingerprint(component, source, slideSize),
      ...(textAdjacency ? { repairHint: "text", nearestTextId: textAdjacency.id, nearestTextDistancePt: textAdjacency.distancePt } : {})
    })
  });
}

function missingNativeTextAdjacency(box, textRegions) {
  let best = null;
  for (const text of textRegions) {
    const distancePt = boxDistance(box, text.box);
    const overlapArea = intersectionArea(box, text.box);
    const overlapRatio = overlapArea / Math.max(1e-6, box.w * box.h);
    const xOverlapRatio = axisOverlap(box.x, box.x + box.w, text.box.x, text.box.x + text.box.w) / Math.max(1e-6, Math.min(box.w, text.box.w));
    const yOverlapRatio = axisOverlap(box.y, box.y + box.h, text.box.y, text.box.y + text.box.h) / Math.max(1e-6, Math.min(box.h, text.box.h));
    const nearPt = Math.max(1.5, Math.min(5, Math.min(text.box.h, Math.max(box.w, box.h)) * 0.45));
    const textScaleCompatible = box.h <= text.box.h * 1.35 || box.w <= text.box.h * 1.8;
    const edgeAdjacent = distancePt <= 0.75 && xOverlapRatio >= 0.35 && textScaleCompatible;
    const adjacent = overlapRatio >= 0.08 || edgeAdjacent || (distancePt <= nearPt && yOverlapRatio >= 0.35 && textScaleCompatible);
    if (!adjacent) continue;
    if (!best || distancePt < best.distancePt) best = { id: String(text.id || ""), distancePt: Math.round(distancePt * 100) / 100 };
  }
  return best;
}

function boxDistance(left, right) {
  const dx = Math.max(0, Math.max(left.x, right.x) - Math.min(left.x + left.w, right.x + right.w));
  const dy = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.h, right.y + right.h));
  return Math.hypot(dx, dy);
}

function intersectionArea(left, right) {
  const w = axisOverlap(left.x, left.x + left.w, right.x, right.x + right.w);
  const h = axisOverlap(left.y, left.y + left.h, right.y, right.y + right.h);
  return w * h;
}

function axisOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function missingComponentFingerprint(component, source, slideSize) {
  const x = Math.round(component.x * slideSize.widthPt / source.width);
  const y = Math.round(component.y * slideSize.heightPt / source.height);
  const w = Math.round(component.w * slideSize.widthPt / source.width);
  const h = Math.round(component.h * slideSize.heightPt / source.height);
  const pixels = Math.round(component.pixelCount / 8) * 8;
  return `${x}:${y}:${w}:${h}:${pixels}:${component.color}`;
}

function buildCoveredMask(source, regions, slideSize) {
  const mask = new Uint8Array(source.width * source.height);
  const pageAreaPt = slideSize.widthPt * slideSize.heightPt;
  for (const region of regions) {
    if (!validBox(region?.box)) continue;
    const areaPt = region.box.w * region.box.h;
    if (areaPt > pageAreaPt * 0.08 && region.role !== "text") continue;
    if (region.geometry?.type === "segment") {
      maskSegmentCorridor(mask, source, slideSize, region.geometry, region.box);
      continue;
    }
    const left = Math.max(0, Math.floor(region.box.x * source.width / slideSize.widthPt));
    const top = Math.max(0, Math.floor(region.box.y * source.height / slideSize.heightPt));
    const right = Math.min(source.width, Math.ceil((region.box.x + region.box.w) * source.width / slideSize.widthPt));
    const bottom = Math.min(source.height, Math.ceil((region.box.y + region.box.h) * source.height / slideSize.heightPt));
    for (let y = top; y < bottom; y += 1) {
      mask.fill(1, y * source.width + left, y * source.width + right);
    }
  }
  return mask;
}

function maskSegmentCorridor(mask, source, slideSize, geometry, box) {
  const left = Math.max(0, Math.floor(box.x * source.width / slideSize.widthPt));
  const top = Math.max(0, Math.floor(box.y * source.height / slideSize.heightPt));
  const right = Math.min(source.width, Math.ceil((box.x + box.w) * source.width / slideSize.widthPt));
  const bottom = Math.min(source.height, Math.ceil((box.y + box.h) * source.height / slideSize.heightPt));
  const corridorPt = Math.max(0.5, Math.min(12, Number(geometry.corridorPt || 2)));
  for (let y = top; y < bottom; y += 1) {
    const slideY = (y + 0.5) * slideSize.heightPt / source.height;
    for (let x = left; x < right; x += 1) {
      const slideX = (x + 0.5) * slideSize.widthPt / source.width;
      if (pointToSegmentDistance(slideX, slideY, geometry.startX, geometry.startY, geometry.endX, geometry.endY) <= corridorPt) {
        mask[y * source.width + x] = 1;
      }
    }
  }
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const ax = Number(x1);
  const ay = Number(y1);
  const bx = Number(x2);
  const by = Number(y2);
  if (![px, py, ax, ay, bx, by].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isMissingForeground(source, generated, x, y, options) {
  const sourceOffset = (y * source.width + x) * 4;
  if (!isForeground(source.rgba, sourceOffset)) return false;
  const gx = Math.min(generated.width - 1, Math.round(x * generated.width / source.width));
  const gy = Math.min(generated.height - 1, Math.round(y * generated.height / source.height));
  const generatedOffset = (gy * generated.width + gx) * 4;
  if (colorDelta(source.rgba, sourceOffset, generated.rgba, generatedOffset) <= options.threshold) return false;
  return !hasNearbyForegroundMatch(source, sourceOffset, generated, gx, gy, options);
}

function hasNearbyForegroundMatch(source, sourceOffset, generated, gx, gy, options) {
  for (let dy = -options.tolerance; dy <= options.tolerance; dy += 1) {
    for (let dx = -options.tolerance; dx <= options.tolerance; dx += 1) {
      const x = gx + dx;
      const y = gy + dy;
      if (x < 0 || y < 0 || x >= generated.width || y >= generated.height) continue;
      const offset = (y * generated.width + x) * 4;
      if (isForeground(generated.rgba, offset) && colorDelta(source.rgba, sourceOffset, generated.rgba, offset) <= options.toleranceDelta) return true;
    }
  }
  return false;
}

function validateImage(image) {
  if (!image || !Buffer.isBuffer(image.rgba) || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || image.width > MAX_DIMENSION || image.height > MAX_DIMENSION
    || image.rgba.length < image.width * image.height * 4) throw new TypeError("missing component quality image is invalid");
}
function validSlideSize(size) { return !!size && Number.isFinite(size.widthPt) && size.widthPt > 0 && Number.isFinite(size.heightPt) && size.heightPt > 0; }
function validBox(box) { return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0; }
function boundedNumber(value, fallback, min, max) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new RangeError("missing component quality option is invalid");
  return result;
}
function colorDelta(left, leftOffset, right, rightOffset) {
  return (Math.abs(left[leftOffset] - right[rightOffset]) + Math.abs(left[leftOffset + 1] - right[rightOffset + 1]) + Math.abs(left[leftOffset + 2] - right[rightOffset + 2]) + Math.abs(left[leftOffset + 3] - right[rightOffset + 3])) / 4;
}
function isForeground(rgba, offset) {
  const r = rgba[offset];
  const g = rgba[offset + 1];
  const b = rgba[offset + 2];
  return (r + g + b) / 3 < 245 || Math.max(r, g, b) - Math.min(r, g, b) > 18;
}
function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}
function roundBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100]));
}

module.exports = { detectMissingNativeComponentRegions };
