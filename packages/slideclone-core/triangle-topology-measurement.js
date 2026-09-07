"use strict";

const MAX_IMAGE_PIXELS = 24_000_000;
const MAX_REGION_PIXELS = 4_000_000;
const HUE_BUCKETS = 24;

function measureTriangleTopologyPrimitives(image, slideBox, slideSize = {}) {
  if (!validImage(image) || !validBox(slideBox)) return null;
  const widthPt = finitePositive(slideSize.widthPt, slideSize.width);
  const heightPt = finitePositive(slideSize.heightPt, slideSize.height);
  if (!widthPt || !heightPt) return null;
  const region = pixelRegion(slideBox, image, widthPt, heightPt);
  if (!region || region.w * region.h > MAX_REGION_PIXELS) return null;

  const dominantHue = findDominantAccentHue(image, region);
  if (!Number.isFinite(dominantHue)) return null;
  const components = accentComponents(image, region, dominantHue);
  const classified = classifyComponents(components, region);
  if (!classified) return null;

  const scaleX = widthPt / image.width;
  const scaleY = heightPt / image.height;
  const left = fitArrow(classified.leftArrow, "left", region, scaleX, scaleY);
  const right = fitArrow(classified.rightArrow, "right", region, scaleX, scaleY);
  const bottom = fitArrow(classified.bottomArrow, "bottom", region, scaleX, scaleY);
  const baseline = fitBaseline(classified.baseline, region, scaleX, scaleY);
  const center = componentSlideBox(classified.center, region, scaleX, scaleY, 2);
  if (![left, right, bottom, baseline, center].every(Boolean)) return null;

  return {
    arrows: [left, right, bottom],
    baseline,
    center,
    accentHue: round(dominantHue),
    measured: true
  };
}

function validImage(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  const rgba = image?.rgba;
  return Number.isInteger(width) && Number.isInteger(height)
    && width > 0 && height > 0 && width * height <= MAX_IMAGE_PIXELS
    && rgba && Number(rgba.length) >= width * height * 4;
}

function validBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every(Number.isFinite)
    && box.w >= 24 && box.h >= 24;
}

function finitePositive(primary, fallback) {
  const value = Number(primary ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function pixelRegion(box, image, widthPt, heightPt) {
  const x0 = clamp(Math.floor(box.x / widthPt * image.width), 0, image.width - 1);
  const y0 = clamp(Math.floor(box.y / heightPt * image.height), 0, image.height - 1);
  const x1 = clamp(Math.ceil((box.x + box.w) / widthPt * image.width), x0 + 1, image.width);
  const y1 = clamp(Math.ceil((box.y + box.h) / heightPt * image.height), y0 + 1, image.height);
  const region = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return region.w >= 24 && region.h >= 24 ? region : null;
}

function findDominantAccentHue(image, region) {
  const bins = Array.from({ length: HUE_BUCKETS }, () => 0);
  for (let y = region.y; y < region.y + region.h; y += 1) {
    for (let x = region.x; x < region.x + region.w; x += 1) {
      const color = hsvAt(image, x, y);
      if (!color || color.s < 0.3 || color.v < 0.18 || color.v > 0.97) continue;
      bins[Math.min(HUE_BUCKETS - 1, Math.floor(color.h / 360 * HUE_BUCKETS))] += color.s;
    }
  }
  const best = bins.reduce((winner, value, index) => value > winner.value ? { index, value } : winner, { index: -1, value: 0 });
  if (best.index < 0 || best.value < region.w * region.h * 0.002) return null;
  return (best.index + 0.5) * 360 / HUE_BUCKETS;
}

function accentComponents(image, region, dominantHue) {
  const size = region.w * region.h;
  const mask = new Uint8Array(size);
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      const color = hsvAt(image, region.x + x, region.y + y);
      if (color && color.s >= 0.24 && color.v >= 0.15 && color.v <= 0.99
        && circularHueDistance(color.h, dominantHue) <= 24) {
        mask[y * region.w + x] = 1;
      }
    }
  }

  const seen = new Uint8Array(size);
  const minimumPixels = Math.max(64, Math.floor(size * 0.00045));
  const components = [];
  for (let sy = 0; sy < region.h; sy += 1) {
    for (let sx = 0; sx < region.w; sx += 1) {
      const seed = sy * region.w + sx;
      if (!mask[seed] || seen[seed]) continue;
      const points = [];
      const queueX = [sx];
      const queueY = [sy];
      seen[seed] = 1;
      for (let head = 0; head < queueX.length; head += 1) {
        const x = queueX[head];
        const y = queueY[head];
        points.push({ x, y });
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) continue;
            const next = ny * region.w + nx;
            if (!mask[next] || seen[next]) continue;
            seen[next] = 1;
            queueX.push(nx);
            queueY.push(ny);
          }
        }
      }
      if (points.length < minimumPixels) continue;
      components.push(componentFromPoints(points));
    }
  }
  return components;
}

function componentFromPoints(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { points, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
}

function classifyComponents(components, region) {
  const usable = components.filter((component) => {
    const widthRatio = component.box.w / region.w;
    const heightRatio = component.box.h / region.h;
    return !(widthRatio > 0.55 && heightRatio > 0.55);
  });
  const horizontal = usable
    .filter((component) => component.box.w / region.w > 0.35 && component.box.h / region.h < 0.16)
    .filter((component) => component.box.y + component.box.h / 2 > region.h * 0.55)
    .sort((left, right) => centerY(left.box) - centerY(right.box));
  const diagonal = usable
    .filter((component) => component.box.w / region.w > 0.16 && component.box.h / region.h > 0.35)
    .filter((component) => component.box.h > component.box.w * 1.2);
  const center = usable
    .filter((component) => component.box.w / region.w >= 0.035 && component.box.w / region.w <= 0.16)
    .filter((component) => component.box.h / region.h >= 0.035 && component.box.h / region.h <= 0.18)
    .filter((component) => Math.abs(centerX(component.box) - region.w / 2) < region.w * 0.18)
    .filter((component) => Math.abs(centerY(component.box) - region.h * 0.55) < region.h * 0.22)
    .sort((left, right) => right.points.length - left.points.length)[0];
  if (horizontal.length < 2 || diagonal.length !== 2 || !center) return null;
  const baseline = horizontal[0];
  const bottomArrow = horizontal[horizontal.length - 1];
  const leftArrow = diagonal.sort((left, right) => centerX(left.box) - centerX(right.box))[0];
  const rightArrow = diagonal[1];
  if (!leftArrow || !rightArrow || baseline === bottomArrow) return null;
  return { leftArrow, rightArrow, bottomArrow, baseline, center };
}

function fitArrow(component, role, region, scaleX, scaleY) {
  const profile = principalProfile(component.points, role);
  if (!profile || profile.length < 24 || profile.shaftWidth < 2 || profile.headWidth < profile.shaftWidth * 1.25) return null;
  const widthScale = (scaleX + scaleY) / 2;
  return {
    from: pointToSlide(profile.from, region, scaleX, scaleY),
    to: pointToSlide(profile.to, region, scaleX, scaleY),
    shaftWidthPt: round(profile.shaftWidth * widthScale),
    headWidthPt: round(profile.headWidth * widthScale),
    headLengthPt: round(profile.headLength * widthScale)
  };
}

function fitBaseline(component, region, scaleX, scaleY) {
  const profile = principalProfile(component.points, "baseline");
  if (!profile || profile.length < 24 || profile.shaftWidth < 2) return null;
  const endpoints = [profile.from, profile.to].sort((left, right) => left.x - right.x);
  return {
    left: pointToSlide(endpoints[0], region, scaleX, scaleY),
    right: pointToSlide(endpoints[1], region, scaleX, scaleY),
    strokeWidthPt: round(profile.shaftWidth * (scaleX + scaleY) / 2)
  };
}

function principalProfile(points, role) {
  if (!Array.isArray(points) || points.length < 24) return null;
  const mean = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  mean.x /= points.length;
  mean.y /= points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - mean.x;
    const dy = point.y - mean.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  let ux = Math.cos(angle);
  let uy = Math.sin(angle);
  if ((role === "left" && (ux < 0 || uy > 0))
    || (role === "right" && (ux < 0 || uy < 0))
    || ((role === "bottom" || role === "baseline") && ux > 0)) {
    ux *= -1;
    uy *= -1;
  }
  const projected = points.map((point) => ({
    t: (point.x - mean.x) * ux + (point.y - mean.y) * uy,
    p: -(point.x - mean.x) * uy + (point.y - mean.y) * ux
  }));
  const minT = Math.min(...projected.map((point) => point.t));
  const maxT = Math.max(...projected.map((point) => point.t));
  const length = maxT - minT;
  if (!Number.isFinite(length) || length < 24) return null;
  const spans = projectionSpans(projected, minT, maxT, 24);
  const shaftWidth = median(spans.slice(3, 18).filter((value) => value > 0));
  const headWidth = Math.max(...spans.slice(14, 23));
  const headBins = spans.map((value, index) => value > shaftWidth * 1.35 && index >= 12 ? index : -1).filter((index) => index >= 0);
  const headLength = headBins.length > 0
    ? (Math.max(...headBins) - Math.min(...headBins) + 1) / spans.length * length
    : length * 0.15;
  return {
    from: { x: mean.x + ux * minT, y: mean.y + uy * minT },
    to: { x: mean.x + ux * maxT, y: mean.y + uy * maxT },
    length,
    shaftWidth,
    headWidth,
    headLength
  };
}

function projectionSpans(points, minT, maxT, count) {
  const buckets = Array.from({ length: count }, () => []);
  const length = Math.max(1, maxT - minT);
  for (const point of points) {
    const index = clamp(Math.floor((point.t - minT) / length * count), 0, count - 1);
    buckets[index].push(point.p);
  }
  return buckets.map((values) => values.length > 0 ? Math.max(...values) - Math.min(...values) : 0);
}

function componentSlideBox(component, region, scaleX, scaleY, padding = 0) {
  if (!component?.box) return null;
  return {
    x: round((region.x + component.box.x - padding) * scaleX),
    y: round((region.y + component.box.y - padding) * scaleY),
    w: round((component.box.w + padding * 2) * scaleX),
    h: round((component.box.h + padding * 2) * scaleY)
  };
}

function pointToSlide(point, region, scaleX, scaleY) {
  return { x: round((region.x + point.x) * scaleX), y: round((region.y + point.y) * scaleY) };
}

function hsvAt(image, x, y) {
  const index = (y * image.width + x) * 4;
  if (image.rgba[index + 3] < 24) return null;
  const r = image.rgba[index] / 255;
  const g = image.rgba[index + 1] / 255;
  const b = image.rgba[index + 2] / 255;
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

function circularHueDistance(left, right) {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function centerX(box) {
  return box.x + box.w / 2;
}

function centerY(box) {
  return box.y + box.h / 2;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

module.exports = { measureTriangleTopologyPrimitives };
