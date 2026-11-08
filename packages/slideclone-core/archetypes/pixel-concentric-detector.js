"use strict";

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });

function detectPixelConcentricCircles(sourceImage, box = {}, slideSize = DEFAULT_SLIDE) {
  if (!isValidImage(sourceImage) || !isValidBox(box) || !isValidSlide(slideSize)) return [];
  const region = toPixelRegion(box, sourceImage, slideSize);
  if (region.w < 48 || region.h < 48) return [];
  const regionArea = region.w * region.h;
  const candidates = [...collectColorBuckets(sourceImage, region).values()]
    .map((bucket) => summarizeCircleBucket(bucket, sourceImage, slideSize, regionArea))
    .filter(Boolean)
    .sort((a, b) => b.pixelBox.w * b.pixelBox.h - a.pixelBox.w * a.pixelBox.h)
    .slice(0, 10);

  let best = [];
  for (const outer of candidates) {
    const nested = candidates.filter((candidate) => isCenteredInside(candidate.pixelBox, outer.pixelBox));
    if (nested.length < 3) continue;
    const chain = selectNestedChain(nested);
    if (chain.length >= 3 && chain.length > best.length) best = chain;
  }
  return best.slice(0, 6).map((candidate, index) => ({
    id: `pixel-concentric-circle-${index + 1}`,
    kind: "native-concentric-circle-candidate",
    shapeHint: "ellipse",
    box: candidate.box,
    color: candidate.color,
    density: candidate.density,
    nativeCandidate: true,
    residualCandidate: false,
    concentricLayerIndex: index,
    source: {
      detector: "pixel-concentric-circle-recovery",
      sourceImageDetected: true,
      method: "chromatic-centered-nested-ellipse-profile"
    }
  }));
}

function collectColorBuckets(image, region) {
  const buckets = new Map();
  for (let y = region.y; y < region.y + region.h; y += 1) {
    for (let x = region.x; x < region.x + region.w; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (Number(image.rgba[offset + 3] ?? 255) < 192) continue;
      const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]].map(Number);
      if (!isChromaticForeground(rgb)) continue;
      const key = rgb.map((value) => Math.min(255, Math.round(value / 12) * 12)).join(",");
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { pixelCount: 0, rgbSums: [0, 0, 0], minX: x, minY: y, maxX: x, maxY: y };
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
    }
  }
  return buckets;
}

function summarizeCircleBucket(bucket, image, slideSize, regionArea) {
  const width = bucket.maxX - bucket.minX + 1;
  const height = bucket.maxY - bucket.minY + 1;
  const area = width * height;
  if (bucket.pixelCount < regionArea * 0.004 || width < 28 || height < 28) return null;
  const aspect = width / Math.max(1, height);
  const density = bucket.pixelCount / Math.max(1, area);
  if (aspect < 0.78 || aspect > 1.28 || density < 0.16 || density > 0.86) return null;
  const rgb = bucket.rgbSums.map((sum) => Math.round(sum / bucket.pixelCount));
  const pixelBox = { x: bucket.minX, y: bucket.minY, w: width, h: height };
  return {
    pixelBox,
    box: pixelBoxToPoints(pixelBox, image, slideSize),
    color: `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    density
  };
}

function isCenteredInside(inner, outer) {
  if (inner === outer) return true;
  const outerSize = Math.max(outer.w, outer.h);
  const ratio = Math.max(inner.w, inner.h) / Math.max(1, outerSize);
  if (ratio < 0.28 || ratio > 0.88) return false;
  const centerDelta = Math.hypot(
    inner.x + inner.w / 2 - (outer.x + outer.w / 2),
    inner.y + inner.h / 2 - (outer.y + outer.h / 2)
  );
  return centerDelta <= outerSize * 0.045;
}

function selectNestedChain(candidates) {
  const ordered = [...candidates].sort((a, b) => b.pixelBox.w - a.pixelBox.w);
  const chain = [];
  for (const candidate of ordered) {
    const previous = chain[chain.length - 1];
    if (!previous || isCenteredInside(candidate.pixelBox, previous.pixelBox)) chain.push(candidate);
  }
  return chain;
}

function isChromaticForeground(rgb) {
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  if (max > 248 && min > 244) return false;
  if (max < 38) return false;
  return max - min >= 24;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = { detectPixelConcentricCircles };
