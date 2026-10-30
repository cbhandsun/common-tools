"use strict";

const MAX_IMAGE_PIXELS = 24_000_000;

function sampleStackedLayerFrontFill(image, frontBox, slideSize = {}, fallback = "#D9EAF7") {
  return measureStackedLayerFront(image, frontBox, slideSize, fallback).fill;
}

function sampleStackedLayerTopFill(image, frontBox, slideSize = {}, fallback = "#EEF7FC") {
  if (!validImage(image) || !validBox(frontBox)) return fallback;
  const widthPt = positive(slideSize.widthPt, slideSize.width);
  const heightPt = positive(slideSize.heightPt, slideSize.height);
  if (!widthPt || !heightPt) return fallback;
  const depthX = Math.min(52, frontBox.w * 0.09);
  const sampleBox = {
    x: frontBox.x + depthX + 10,
    y: Math.max(0, frontBox.y - 24),
    w: frontBox.w - (depthX + 10) * 2,
    h: 15
  };
  const dominant = dominantColor(image, sampleBox, widthPt, heightPt);
  return dominant ? toHex(dominant.red, dominant.green, dominant.blue) : fallback;
}

function measureStackedLayerFront(image, frontBox, slideSize = {}, fallback = "#D9EAF7") {
  if (!validImage(image) || !validBox(frontBox)) return { fill: fallback, box: frontBox, measured: false };
  const widthPt = positive(slideSize.widthPt, slideSize.width);
  const heightPt = positive(slideSize.heightPt, slideSize.height);
  if (!widthPt || !heightPt) return { fill: fallback, box: frontBox, measured: false };
  const inset = {
    x: frontBox.x + Math.min(10, frontBox.w * 0.08),
    y: frontBox.y + Math.min(8, frontBox.h * 0.18),
    w: frontBox.w - Math.min(20, frontBox.w * 0.16),
    h: frontBox.h - Math.min(16, frontBox.h * 0.36)
  };
  if (!validBox(inset)) return { fill: fallback, box: frontBox, measured: false };
  const dominant = dominantColor(image, inset, widthPt, heightPt);
  if (!dominant || dominant.count < 8) return { fill: fallback, box: frontBox, measured: false };
  const color = {
    red: dominant.red,
    green: dominant.green,
    blue: dominant.blue
  };
  const fill = toHex(color.red, color.green, color.blue);
  const search = toPixelBox({
    x: Math.max(0, frontBox.x - Math.min(24, frontBox.w * 0.08)),
    y: Math.max(0, frontBox.y - Math.min(32, frontBox.h * 0.7)),
    w: frontBox.w + Math.min(48, frontBox.w * 0.16),
    h: frontBox.h + Math.min(64, frontBox.h * 1.4)
  }, image, widthPt, heightPt);
  const rowProfiles = [];
  let maximum = 0;
  for (let localY = 0; localY < search.h; localY += 1) {
    const y = search.y + localY;
    let count = 0;
    let first = null;
    let last = null;
    for (let x = search.x; x < search.x + search.w; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.rgba[offset + 3] < 64 || colorDistance(image.rgba, offset, color) > 24) continue;
      count += 1;
      if (first === null) first = x;
      last = x;
    }
    maximum = Math.max(maximum, count);
    rowProfiles.push({ localY, count, first, last });
  }
  if (maximum < search.w * 0.35) return { fill, box: frontBox, measured: false };
  const maximumGap = frontBox.h / heightPt * image.height * 0.5;
  const strongRuns = mergeNearbyRuns(
    runs(rowProfiles.map((row) => row.count >= maximum * 0.55)),
    maximumGap
  );
  const anchor = frontBox.y / heightPt * image.height + frontBox.h / heightPt * image.height / 2 - search.y;
  const band = strongRuns
    .sort((left, right) => distanceToRun(anchor, left) - distanceToRun(anchor, right))[0];
  if (!band) return { fill, box: frontBox, measured: false };
  const bandRows = rowProfiles.slice(band.start, band.end + 1).filter((row) => row.first !== null);
  const left = median(bandRows.map((row) => row.first));
  const right = median(bandRows.map((row) => row.last));
  const measuredBox = {
    x: round(left / image.width * widthPt),
    y: round((search.y + band.start) / image.height * heightPt),
    w: round((right - left + 1) / image.width * widthPt),
    h: round(band.length / image.height * heightPt)
  };
  const plausible = measuredBox.w >= frontBox.w * 0.65 && measuredBox.w <= frontBox.w * 1.12
    && measuredBox.h >= frontBox.h * 0.55 && measuredBox.h <= frontBox.h * 1.25
    && Math.abs((measuredBox.x + measuredBox.w / 2) - (frontBox.x + frontBox.w / 2)) <= frontBox.w * 0.12;
  return plausible ? { fill, box: measuredBox, measured: true } : { fill, box: frontBox, measured: false };
}

function dominantColor(image, box, widthPt, heightPt) {
  if (!validBox(box)) return null;
  const pixels = toPixelBox(box, image, widthPt, heightPt);
  const buckets = new Map();
  const step = Math.max(1, Math.ceil(Math.sqrt((pixels.w * pixels.h) / 5000)));
  for (let y = pixels.y; y < pixels.y + pixels.h; y += step) {
    for (let x = pixels.x; x < pixels.x + pixels.w; x += step) {
      const offset = (y * image.width + x) * 4;
      if (image.rgba[offset + 3] < 64) continue;
      const red = image.rgba[offset];
      const green = image.rgba[offset + 1];
      const blue = image.rgba[offset + 2];
      if (red > 248 && green > 248 && blue > 248) continue;
      const key = `${Math.round(red / 8)},${Math.round(green / 8)},${Math.round(blue / 8)}`;
      const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      buckets.set(key, bucket);
    }
  }
  const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
  if (!dominant || dominant.count < 8) return null;
  return {
    red: dominant.red / dominant.count,
    green: dominant.green / dominant.count,
    blue: dominant.blue / dominant.count
  };
}

function validImage(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  return Number.isInteger(width) && Number.isInteger(height)
    && width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS
    && image?.rgba && Number(image.rgba.length) >= width * height * 4;
}

function validBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}

function positive(primary, fallback) {
  const value = Number(primary ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function toPixelBox(box, image, widthPt, heightPt) {
  const x0 = clamp(Math.floor(box.x / widthPt * image.width), 0, image.width - 1);
  const y0 = clamp(Math.floor(box.y / heightPt * image.height), 0, image.height - 1);
  const x1 = clamp(Math.ceil((box.x + box.w) / widthPt * image.width), x0 + 1, image.width);
  const y1 = clamp(Math.ceil((box.y + box.h) / heightPt * image.height), y0 + 1, image.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function toHex(red, green, blue) {
  return `#${[red, green, blue].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function colorDistance(rgba, offset, color) {
  return Math.hypot(rgba[offset] - color.red, rgba[offset + 1] - color.green, rgba[offset + 2] - color.blue);
}

function runs(values) {
  const result = [];
  let start = null;
  for (let index = 0; index <= values.length; index += 1) {
    if (index < values.length && values[index]) {
      if (start === null) start = index;
    } else if (start !== null) {
      result.push({ start, end: index - 1, length: index - start });
      start = null;
    }
  }
  return result;
}

function mergeNearbyRuns(items, maximumGap) {
  const merged = [];
  for (const item of items) {
    const previous = merged[merged.length - 1];
    if (previous && item.start - previous.end - 1 <= maximumGap) {
      previous.end = item.end;
      previous.length = previous.end - previous.start + 1;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

function distanceToRun(value, run) {
  if (value < run.start) return run.start - value;
  if (value > run.end) return value - run.end;
  return 0;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

module.exports = { measureStackedLayerFront, sampleStackedLayerFrontFill, sampleStackedLayerTopFill };
