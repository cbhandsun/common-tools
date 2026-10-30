"use strict";

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });

function detectPixelVennLobes(sourceImage, box = {}, slideSize = DEFAULT_SLIDE) {
  if (!isValidImage(sourceImage) || !isValidBox(box) || !isValidSlide(slideSize)) return [];
  const region = toPixelRegion(box, sourceImage, slideSize);
  if (region.w < 40 || region.h < 30) return [];
  const buckets = collectColorBuckets(sourceImage, region);
  const candidates = [...buckets.values()]
    .map((bucket) => summarizeBucket(bucket, sourceImage, region, slideSize))
    .filter(Boolean)
    .sort((a, b) => b.pixelCount - a.pixelCount)
    .slice(0, 8);

  let best = null;
  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const pair = scoreVennPair(candidates[leftIndex], candidates[rightIndex], region);
      if (pair && (!best || pair.score > best.score)) best = pair;
    }
  }
  return best ? best.lobes : [];
}

function collectColorBuckets(image, region) {
  const buckets = new Map();
  for (let y = region.y; y < region.y + region.h; y += 1) {
    for (let x = region.x; x < region.x + region.w; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = Number(image.rgba[offset + 3] ?? 255);
      if (alpha < 192) continue;
      const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]].map(Number);
      if (!isChromaticForeground(rgb)) continue;
      const key = rgb.map((value) => Math.min(255, Math.round(value / 24) * 24)).join(",");
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, rgbSums: [0, 0, 0], pixelCount: 0, minX: x, minY: y, maxX: x, maxY: y, rowCounts: new Map() };
        buckets.set(key, bucket);
      }
      bucket.pixelCount += 1;
      bucket.rgbSums[0] += rgb[0];
      bucket.rgbSums[1] += rgb[1];
      bucket.rgbSums[2] += rgb[2];
      bucket.minX = Math.min(bucket.minX, x);
      bucket.minY = Math.min(bucket.minY, y);
      bucket.maxX = Math.max(bucket.maxX, x);
      bucket.maxY = Math.max(bucket.maxY, y);
      bucket.rowCounts.set(y, Number(bucket.rowCounts.get(y) || 0) + 1);
    }
  }
  return buckets;
}

function summarizeBucket(bucket, image, region, slideSize) {
  const width = bucket.maxX - bucket.minX + 1;
  const height = bucket.maxY - bucket.minY + 1;
  const regionArea = region.w * region.h;
  if (bucket.pixelCount < regionArea * 0.025 || width < region.w * 0.16 || height < region.h * 0.2) return null;
  const aspect = width / Math.max(1, height);
  if (aspect < 0.65 || aspect > 2.1) return null;
  const rows = [];
  for (let y = bucket.minY; y <= bucket.maxY; y += 1) rows.push(Number(bucket.rowCounts.get(y) || 0));
  const maxRow = Math.max(1, ...rows);
  const edgeDepth = Math.max(1, Math.floor(rows.length * 0.12));
  const edgeMean = average([...rows.slice(0, edgeDepth), ...rows.slice(-edgeDepth)]) / maxRow;
  const middleStart = Math.floor(rows.length * 0.35);
  const middleEnd = Math.max(middleStart + 1, Math.ceil(rows.length * 0.65));
  const middleMean = average(rows.slice(middleStart, middleEnd)) / maxRow;
  if (edgeMean > 0.62 || middleMean < 0.72) return null;
  const density = bucket.pixelCount / Math.max(1, width * height);
  if (density < 0.38 || density > 0.9) return null;
  const rgb = bucket.rgbSums.map((sum) => Math.round(sum / bucket.pixelCount));
  return {
    pixelCount: bucket.pixelCount,
    pixelBox: { x: bucket.minX, y: bucket.minY, w: width, h: height },
    box: pixelBoxToPoints({ x: bucket.minX, y: bucket.minY, w: width, h: height }, image, slideSize),
    color: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    edgeMean,
    middleMean,
    density
  };
}

function scoreVennPair(first, second, region) {
  const ordered = [first, second].sort((a, b) => a.pixelBox.x - b.pixelBox.x);
  const [left, right] = ordered;
  const heightRatio = Math.min(left.pixelBox.h, right.pixelBox.h) / Math.max(left.pixelBox.h, right.pixelBox.h);
  if (heightRatio < 0.78) return null;
  const leftCenterY = left.pixelBox.y + left.pixelBox.h / 2;
  const rightCenterY = right.pixelBox.y + right.pixelBox.h / 2;
  const maxHeight = Math.max(left.pixelBox.h, right.pixelBox.h);
  if (Math.abs(leftCenterY - rightCenterY) > maxHeight * 0.14) return null;
  const horizontalGap = right.pixelBox.x - (left.pixelBox.x + left.pixelBox.w);
  if (horizontalGap > maxHeight * 0.12 || horizontalGap < -maxHeight * 0.75) return null;
  const combinedWidth = Math.max(left.pixelBox.x + left.pixelBox.w, right.pixelBox.x + right.pixelBox.w) - Math.min(left.pixelBox.x, right.pixelBox.x);
  if (combinedWidth < region.w * 0.42 || combinedWidth > region.w * 0.88) return null;

  const inferredLeft = recoverEllipseBox(left, "left", right.pixelBox);
  const inferredRight = recoverEllipseBox(right, "right", left.pixelBox);
  const overlap = overlapRatio(inferredLeft, inferredRight);
  if (overlap < 0.045 || overlap > 0.48) return null;
  const score = heightRatio + (1 - Math.min(1, Math.abs(leftCenterY - rightCenterY) / maxHeight)) + Math.min(0.5, overlap);
  return {
    score,
    lobes: [
      toLobe(left, inferredLeft, 0),
      toLobe(right, inferredRight, 1)
    ]
  };
}

function recoverEllipseBox(candidate, side, peerBox) {
  const observed = candidate.pixelBox;
  const peerAspectWidth = Number(peerBox.w || 0) * observed.h / Math.max(1, Number(peerBox.h || 0));
  const expectedWidth = Math.max(observed.w, observed.h * 1.3, peerAspectWidth);
  if (side === "left") {
    return { x: observed.x, y: observed.y, w: Math.min(expectedWidth, peerBox.x + peerBox.w - observed.x), h: observed.h };
  }
  const right = observed.x + observed.w;
  return { x: Math.max(peerBox.x, right - expectedWidth), y: observed.y, w: Math.min(expectedWidth, right - peerBox.x), h: observed.h };
}

function toLobe(candidate, recoveredPixelBox, index) {
  const scaleX = candidate.box.w / candidate.pixelBox.w;
  const scaleY = candidate.box.h / candidate.pixelBox.h;
  return {
    id: `pixel-venn-lobe-${index + 1}`,
    kind: "native-venn-ellipse-candidate",
    shapeHint: "ellipse",
    box: {
      x: candidate.box.x + (recoveredPixelBox.x - candidate.pixelBox.x) * scaleX,
      y: candidate.box.y + (recoveredPixelBox.y - candidate.pixelBox.y) * scaleY,
      w: recoveredPixelBox.w * scaleX,
      h: recoveredPixelBox.h * scaleY
    },
    color: candidate.color,
    density: candidate.density,
    vennObservedBox: candidate.box,
    vennRecoveryConfidence: round(1 - Math.min(0.35, candidate.edgeMean * 0.3)),
    nativeCandidate: true,
    residualCandidate: false,
    source: { detector: "pixel-venn-lobe-recovery", sourceImageDetected: true, method: "chromatic-ellipse-row-profile" }
  };
}

function isChromaticForeground(rgb) {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  if (max > 246 && min > 240) return false;
  if (max < 45) return false;
  return max - min >= 28;
}

function toPixelRegion(box, image, slideSize) {
  const x = clamp(Math.floor(Number(box.x) / Number(slideSize.widthPt) * image.width), 0, image.width - 1);
  const y = clamp(Math.floor(Number(box.y) / Number(slideSize.heightPt) * image.height), 0, image.height - 1);
  const right = clamp(Math.ceil((Number(box.x) + Number(box.w)) / Number(slideSize.widthPt) * image.width), x + 1, image.width);
  const bottom = clamp(Math.ceil((Number(box.y) + Number(box.h)) / Number(slideSize.heightPt) * image.height), y + 1, image.height);
  return { x, y, w: right - x, h: bottom - y };
}

function pixelBoxToPoints(box, image, slideSize) {
  return {
    x: box.x / image.width * Number(slideSize.widthPt),
    y: box.y / image.height * Number(slideSize.heightPt),
    w: box.w / image.width * Number(slideSize.widthPt),
    h: box.h / image.height * Number(slideSize.heightPt)
  };
}

function overlapRatio(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

function isValidImage(image) {
  return Number.isInteger(image?.width) && image.width > 0 && Number.isInteger(image?.height) && image.height > 0
    && image.rgba && typeof image.rgba.length === "number" && image.rgba.length >= image.width * image.height * 4;
}

function isValidBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value))) && Number(box.w) > 0 && Number(box.h) > 0;
}

function isValidSlide(slide) {
  return Number.isFinite(Number(slide?.widthPt)) && Number(slide.widthPt) > 0 && Number.isFinite(Number(slide?.heightPt)) && Number(slide.heightPt) > 0;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = { detectPixelVennLobes };
