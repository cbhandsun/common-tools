"use strict";

const MAX_IMAGE_PIXELS = 24_000_000;

function measurePrototypeLoopGeometry(image, slideSize = {}) {
  if (!validImage(image)) return null;
  const widthPt = positive(slideSize.widthPt, slideSize.width);
  const heightPt = positive(slideSize.heightPt, slideSize.height);
  if (!widthPt || !heightPt) return null;
  const scaleX = widthPt / image.width;
  const scaleY = heightPt / image.height;
  const mask = buildGreenMask(image);
  const blueMask = buildBlueMask(image);
  const rawScreenshotBox = detectFrame(mask, image, { x: widthPt * 0.43, y: heightPt * 0.28, w: widthPt * 0.34, h: heightPt * 0.39 }, scaleX, scaleY);
  const portalBox = detectFrame(mask, image, { x: widthPt * 0.73, y: heightPt * 0.28, w: widthPt * 0.23, h: heightPt * 0.39 }, scaleX, scaleY);
  if (!rawScreenshotBox || !portalBox || rawScreenshotBox.x + rawScreenshotBox.w >= portalBox.x) return null;
  const screenshotBox = normalizeScreenshotFrame(rawScreenshotBox, portalBox);
  const skillBox = detectColoredBounds(blueMask, image, {
    x: widthPt * 0.22,
    y: heightPt * 0.27,
    w: widthPt * 0.25,
    h: heightPt * 0.4
  }, scaleX, scaleY);

  const topRoute = detectRoute(mask, image, {
    x: screenshotBox.x + screenshotBox.w * 0.28,
    y: heightPt * 0.14,
    w: portalBox.x + portalBox.w * 0.58 - (screenshotBox.x + screenshotBox.w * 0.28),
    h: Math.max(20, Math.min(screenshotBox.y, portalBox.y) - heightPt * 0.14 - 4)
  }, scaleX, scaleY);
  const lowerStart = Math.max(screenshotBox.y + screenshotBox.h, portalBox.y + portalBox.h) + 4;
  const bottomRoute = detectRoute(mask, image, {
    x: screenshotBox.x + screenshotBox.w * 0.28,
    y: lowerStart,
    w: portalBox.x + portalBox.w * 0.58 - (screenshotBox.x + screenshotBox.w * 0.28),
    h: Math.max(20, heightPt * 0.84 - lowerStart)
  }, scaleX, scaleY);
  if (!topRoute || !bottomRoute) return null;
  const strokeWidthPt = round(clamp((topRoute.strokeWidthPt + bottomRoute.strokeWidthPt) / 2, 3, 14));
  return {
    screenshotBox,
    portalBox,
    skillBox,
    topRoute: { ...topRoute, strokeWidthPt },
    bottomRoute: { ...bottomRoute, strokeWidthPt },
    measured: true
  };
}

function validImage(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  return Number.isInteger(width) && Number.isInteger(height)
    && width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS
    && image?.rgba && Number(image.rgba.length) >= width * height * 4;
}

function positive(primary, fallback) {
  const value = Number(primary ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function buildGreenMask(image) {
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const color = hsv(image.rgba[index], image.rgba[index + 1], image.rgba[index + 2]);
      if (color.h >= 120 && color.h <= 175 && color.s >= 0.2 && color.v >= 0.18 && color.v <= 0.99) {
        mask[y * image.width + x] = 1;
      }
    }
  }
  return mask;
}

function buildBlueMask(image) {
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const color = hsv(image.rgba[index], image.rgba[index + 1], image.rgba[index + 2]);
      if (color.h >= 185 && color.h <= 235 && color.s >= 0.34 && color.v >= 0.25) {
        mask[y * image.width + x] = 1;
      }
    }
  }
  return mask;
}

function detectColoredBounds(mask, image, boundsPt, scaleX, scaleY) {
  const region = pixelBox(boundsPt, image, scaleX, scaleY);
  if (!region) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let pixels = 0;
  for (let y = region.y; y < region.y + region.h; y += 1) {
    for (let x = region.x; x < region.x + region.w; x += 1) {
      if (mask[y * image.width + x] !== 1) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      pixels += 1;
    }
  }
  if (pixels < region.w * region.h * 0.08 || right <= left || bottom <= top) return null;
  const result = {
    x: round(left * scaleX),
    y: round(top * scaleY),
    w: round((right - left + 1) * scaleX),
    h: round((bottom - top + 1) * scaleY)
  };
  return result.w >= boundsPt.w * 0.3 && result.h >= boundsPt.h * 0.3 ? result : null;
}

function normalizeScreenshotFrame(frame, portalBox) {
  // The orange warning badge occludes the screenshot's upper-right border.
  // Restore the expected browser aspect only when the measured frame is too narrow.
  const targetWidth = Math.min(frame.h * 1.4, Math.max(frame.w, portalBox.x - frame.x - 24));
  return targetWidth > frame.w
    ? { ...frame, w: round(targetWidth) }
    : frame;
}

function detectFrame(mask, image, boundsPt, scaleX, scaleY) {
  const region = pixelBox(boundsPt, image, scaleX, scaleY);
  if (!region) return null;
  const columnThreshold = region.h * 0.32;
  const columnRuns = runs(Array.from({ length: region.w }, (_, localX) => {
    let count = 0;
    for (let y = region.y; y < region.y + region.h; y += 1) count += mask[y * image.width + region.x + localX];
    return count >= columnThreshold;
  })).filter((run) => run.length <= region.w * 0.12);
  if (columnRuns.length < 2) return null;
  const candidates = [];
  for (let leftIndex = 0; leftIndex < columnRuns.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < columnRuns.length; rightIndex += 1) {
      const left = columnRuns[leftIndex];
      const right = columnRuns[rightIndex];
      if (right.start - left.end < region.w * 0.25) continue;
      const frameLeft = region.x + left.start;
      const frameRight = region.x + right.end;
      const frameWidth = frameRight - frameLeft + 1;
      const rowProfiles = Array.from({ length: region.h }, (_, localY) => {
        let count = 0;
        const y = region.y + localY;
        for (let x = frameLeft; x <= frameRight; x += 1) count += mask[y * image.width + x];
        return { localY, count, coverage: count / frameWidth };
      });
      const rowRuns = runs(rowProfiles.map((item) => item.coverage >= 0.52))
        .filter((run) => run.length <= region.h * 0.12);
      if (rowRuns.length < 2) continue;
      const top = rowRuns[0];
      const bottom = rowRuns[rowRuns.length - 1];
      const edgeCoverage = Math.min(
        Math.max(...rowProfiles.slice(top.start, top.end + 1).map((item) => item.coverage)),
        Math.max(...rowProfiles.slice(bottom.start, bottom.end + 1).map((item) => item.coverage))
      );
      const frameScore = edgeCoverage * Math.sqrt(frameWidth);
      candidates.push({ frameLeft, frameRight, top, bottom, edgeCoverage, frameScore });
    }
  }
  const best = candidates.sort((left, right) => right.frameScore - left.frameScore)[0];
  if (!best) return null;
  const { frameLeft, frameRight, top, bottom } = best;
  const x = frameLeft * scaleX;
  const y = (region.y + top.start) * scaleY;
  const rightPt = (frameRight + 1) * scaleX;
  const bottomPt = (region.y + bottom.end + 1) * scaleY;
  const box = { x: round(x), y: round(y), w: round(rightPt - x), h: round(bottomPt - y) };
  return box.w >= boundsPt.w * 0.35 && box.h >= boundsPt.h * 0.35 ? box : null;
}

function detectRoute(mask, image, boundsPt, scaleX, scaleY) {
  const region = pixelBox(boundsPt, image, scaleX, scaleY);
  if (!region) return null;
  const rowProfiles = [];
  for (let localY = 0; localY < region.h; localY += 1) {
    const y = region.y + localY;
    const row = Array.from({ length: region.w }, (_, localX) => mask[y * image.width + region.x + localX] === 1);
    const longest = longestRun(runs(row));
    rowProfiles.push({ localY, longest, length: longest?.length || 0 });
  }
  const best = rowProfiles.sort((left, right) => right.length - left.length)[0];
  if (!best?.longest || best.length < region.w * 0.35) return null;
  const strongRows = rowProfiles
    .filter((item) => item.length >= best.length * 0.62 && Math.abs(item.localY - best.localY) <= region.h * 0.15)
    .map((item) => item.localY)
    .sort((left, right) => left - right);
  const horizontalBand = containingRun(runsFromIndices(strongRows), best.localY);
  if (!horizontalBand) return null;
  const yPx = region.y + (horizontalBand.start + horizontalBand.end) / 2;
  const xStart = region.x + best.longest.start;
  const xEnd = region.x + best.longest.end;
  // Arrowheads shorten the solid vertical shaft, especially on the lower return path.
  const columnThreshold = region.h * 0.18;
  const verticalRuns = runs(Array.from({ length: Math.max(1, xEnd - xStart + 1) }, (_, localX) => {
    let count = 0;
    const x = xStart + localX;
    for (let y = region.y; y < region.y + region.h; y += 1) count += mask[y * image.width + x];
    return count >= columnThreshold;
  }));
  const leftRun = verticalRuns[0];
  const rightRun = verticalRuns[verticalRuns.length - 1];
  const leftX = leftRun ? xStart + (leftRun.start + leftRun.end) / 2 : xStart;
  const rightX = rightRun ? xStart + (rightRun.start + rightRun.end) / 2 : xEnd;
  if (rightX - leftX < region.w * 0.3) return null;
  return {
    leftX: round(leftX * scaleX),
    rightX: round(rightX * scaleX),
    y: round(yPx * scaleY),
    strokeWidthPt: round((horizontalBand.end - horizontalBand.start + 1) * scaleY)
  };
}

function pixelBox(box, image, scaleX, scaleY) {
  if (![box?.x, box?.y, box?.w, box?.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return null;
  const x0 = clamp(Math.floor(box.x / scaleX), 0, image.width - 1);
  const y0 = clamp(Math.floor(box.y / scaleY), 0, image.height - 1);
  const x1 = clamp(Math.ceil((box.x + box.w) / scaleX), x0 + 1, image.width);
  const y1 = clamp(Math.ceil((box.y + box.h) / scaleY), y0 + 1, image.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

function runsFromIndices(indices) {
  if (!indices.length) return [];
  const values = Array.from({ length: indices[indices.length - 1] + 1 }, () => false);
  for (const index of indices) values[index] = true;
  return runs(values);
}

function containingRun(items, index) {
  return items.find((item) => index >= item.start && index <= item.end) || null;
}

function longestRun(items) {
  return items.sort((left, right) => right.length - left.length)[0] || null;
}

function hsv(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { h: hue, s: max === 0 ? 0 : delta / max, v: max };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

module.exports = { measurePrototypeLoopGeometry };
