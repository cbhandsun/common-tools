"use strict";

const MAX_COMPONENTS = 96;
const MAX_PIXELS = 24_000_000;

function detectSemanticPieComponents(image, components = [], region = {}, semanticHint = "") {
  if (!validImage(image) || !validRegion(region)) return [];
  if (!Array.isArray(components) || components.length < 2 || components.length > MAX_COMPONENTS) return [];
  const regionArea = Number(region.w) * Number(region.h);
  const candidates = components.filter((component) => validComponent(component, regionArea));
  if (candidates.length < 2) return [];
  const clusters = connectedClusters(candidates);
  const match = clusters
    .map((cluster) => scorePieCluster(cluster, region, regionArea))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0];
  if (!match) return [];

  const assignments = sampleCircumference(image, match.parentBox, match.components);
  if (assignments.coverage < 0.9) return [];
  const segments = match.components.map((component, index) => {
    const run = longestCircularRun(assignments.indices, index);
    if (!run || run.length < 8) return null;
    return {
      ...component,
      kind: "native-pie-segment-candidate",
      shapeHint: "pie-segment",
      pieParentBox: match.parentBox,
      pieSegmentAngles: { startDeg: run.start, endDeg: run.end },
      semanticChartPart: true
    };
  }).filter(Boolean);
  if (segments.length !== match.components.length) return [];
  const totalSweep = segments.reduce((sum, component) => sum + positiveSweep(component.pieSegmentAngles), 0);
  return totalSweep >= 345 && totalSweep <= 375 ? segments : [];
}

function isPieSemanticHint(value) {
  return /(?:^|[^a-z])pie(?:[^a-z]|$)|pie[-_\s]?chart|饼图|扇区图|份额占比|比例图/i.test(String(value || ""));
}

function validImage(image) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  return Number.isInteger(width) && Number.isInteger(height)
    && width > 0 && height > 0 && width * height <= MAX_PIXELS
    && image?.rgba && Number(image.rgba.length) >= width * height * 4;
}

function validRegion(region) {
  return [region?.x, region?.y, region?.w, region?.h].every(Number.isFinite)
    && Number(region.w) >= 16 && Number(region.h) >= 16;
}

function validComponent(component, regionArea) {
  const box = component?.box || {};
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return false;
  const area = Number(box.w) * Number(box.h);
  const pixels = Number(component.pixelCount);
  return component.colorSeparated === true
    && /^#[0-9a-f]{6}$/i.test(String(component.color || ""))
    && Number(box.w) >= 12 && Number(box.h) >= 12
    && area / regionArea >= 0.004 && area / regionArea <= 0.36
    && Number.isFinite(pixels) && pixels >= 80 && pixels <= area;
}

function connectedClusters(components) {
  const remaining = new Set(components);
  const clusters = [];
  while (remaining.size > 0) {
    const seed = remaining.values().next().value;
    remaining.delete(seed);
    const cluster = [seed];
    for (let index = 0; index < cluster.length; index += 1) {
      const current = cluster[index];
      for (const candidate of [...remaining]) {
        if (!boxesOverlap(current.box, candidate.box)) continue;
        remaining.delete(candidate);
        cluster.push(candidate);
      }
    }
    if (cluster.length >= 2 && cluster.length <= 12) clusters.push(cluster);
  }
  return clusters;
}

function scorePieCluster(components, region, regionArea) {
  const parentBox = components.map((component) => component.box).reduce(unionBox);
  const width = Number(parentBox.w);
  const height = Number(parentBox.h);
  const aspect = width / Math.max(1, height);
  const areaRatio = width * height / regionArea;
  const density = components.reduce((sum, component) => sum + Number(component.pixelCount), 0) / Math.max(1, width * height);
  if (width < 40 || height < 40 || aspect < 0.72 || aspect > 1.38) return null;
  if (areaRatio < 0.025 || areaRatio > 0.55 || density < 0.58 || density > 0.88) return null;
  const center = { x: parentBox.x + width / 2, y: parentBox.y + height / 2 };
  if (!components.every((component) => boxTouchesPoint(component.box, center, 5))) return null;
  const distinctColors = new Set(components.map((component) => component.color.toLowerCase()));
  if (distinctColors.size !== components.length) return null;
  return {
    components: components.sort((left, right) => Number(left.color.localeCompare(right.color))),
    parentBox,
    score: density + Math.min(width, height) / Math.max(Number(region.w), Number(region.h))
  };
}

function sampleCircumference(image, parentBox, components) {
  const cx = Number(parentBox.x) + Number(parentBox.w) / 2;
  const cy = Number(parentBox.y) + Number(parentBox.h) / 2;
  const radius = Math.min(Number(parentBox.w), Number(parentBox.h)) * 0.36;
  const colors = components.map((component) => parseHex(component.color));
  let assigned = 0;
  const indices = Array.from({ length: 360 }, (_, angle) => {
    const radians = angle * Math.PI / 180;
    const x = Math.max(0, Math.min(image.width - 1, Math.round(cx + Math.cos(radians) * radius)));
    const y = Math.max(0, Math.min(image.height - 1, Math.round(cy + Math.sin(radians) * radius)));
    const offset = (y * image.width + x) * 4;
    const sample = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
    const ranked = colors.map((color, index) => ({ index, distance: colorDistance(sample, color) })).sort((a, b) => a.distance - b.distance);
    if (!ranked[0] || ranked[0].distance > 72) return -1;
    assigned += 1;
    return ranked[0].index;
  });
  return { indices, coverage: assigned / 360 };
}

function longestCircularRun(values, target) {
  let best = null;
  let start = null;
  for (let index = 0; index < values.length * 2; index += 1) {
    if (values[index % values.length] === target) {
      if (start === null) start = index;
      const length = Math.min(values.length, index - start + 1);
      if (!best || length > best.length) best = { start: start % values.length, end: (index + 1) % values.length, length };
    } else {
      start = null;
    }
  }
  return best;
}

function positiveSweep(angles = {}) {
  const start = Number(angles.startDeg || 0);
  const end = Number(angles.endDeg || 0);
  return ((end - start) % 360 + 360) % 360 || 360;
}

function boxesOverlap(left = {}, right = {}) {
  return Number(left.x) <= Number(right.x) + Number(right.w)
    && Number(right.x) <= Number(left.x) + Number(left.w)
    && Number(left.y) <= Number(right.y) + Number(right.h)
    && Number(right.y) <= Number(left.y) + Number(left.h);
}

function boxTouchesPoint(box = {}, point = {}, tolerance = 0) {
  return Number(point.x) >= Number(box.x) - tolerance
    && Number(point.x) <= Number(box.x) + Number(box.w) + tolerance
    && Number(point.y) >= Number(box.y) - tolerance
    && Number(point.y) <= Number(box.y) + Number(box.h) + tolerance;
}

function unionBox(left, right) {
  const x = Math.min(Number(left.x), Number(right.x));
  const y = Math.min(Number(left.y), Number(right.y));
  const rightEdge = Math.max(Number(left.x) + Number(left.w), Number(right.x) + Number(right.w));
  const bottom = Math.max(Number(left.y) + Number(left.h), Number(right.y) + Number(right.h));
  return { x, y, w: rightEdge - x, h: bottom - y };
}

function parseHex(value) {
  const hex = String(value).slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function colorDistance(left, right) {
  return Math.hypot(Number(left[0]) - Number(right[0]), Number(left[1]) - Number(right[1]), Number(left[2]) - Number(right[2]));
}

module.exports = { detectSemanticPieComponents, isPieSemanticHint };
