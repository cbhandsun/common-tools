"use strict";


function cycleDonutSegmentPoints(startDeg, endDeg, holeRatio) {
  const sweep = (endDeg - startDeg + 360) % 360;
  const steps = Math.max(4, Math.min(20, Math.ceil(sweep / 16)));
  const innerRadius = Math.max(0.18, Math.min(0.78, Number(holeRatio || 0.62))) * 0.5;
  const outer = [];
  const inner = [];
  for (let index = 0; index <= steps; index += 1) outer.push(cyclePointOnUnitCircle(startDeg + sweep * index / steps, 0.5));
  for (let index = steps; index >= 0; index -= 1) inner.push(cyclePointOnUnitCircle(startDeg + sweep * index / steps, innerRadius));
  return [...outer, ...inner];
}

function cyclePointOnUnitCircle(degrees, radius) {
  const radians = normalizeDegrees(degrees) * Math.PI / 180;
  return { x: round(0.5 + Math.cos(radians) * radius), y: round(0.5 + Math.sin(radians) * radius) };
}

function cyclePointOnBox(box = {}, degrees, radius) {
  const radians = normalizeDegrees(degrees) * Math.PI / 180;
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2 + Math.cos(radians) * radius,
    y: Number(box.y || 0) + Number(box.h || 0) / 2 + Math.sin(radians) * radius
  };
}

function normalizeDegrees(value) {
  const number = Number(value);
  return Number.isFinite(number) ? ((number % 360) + 360) % 360 : null;
}

function lineBox(from = {}, to = {}) {
  return {
    x: round(from.x),
    y: round(from.y),
    w: round(Number(to.x || 0) - Number(from.x || 0)),
    h: round(Number(to.y || 0) - Number(from.y || 0))
  };
}

function boxCenter(box = {}) {
  return { x: Number(box.x || 0) + Number(box.w || 0) / 2, y: Number(box.y || 0) + Number(box.h || 0) / 2 };
}

function clusterByCoordinate(items = [], coordinate, tolerance = 1) {
  const clusters = [];
  for (const item of [...items].sort((left, right) => coordinate(left) - coordinate(right))) {
    const value = coordinate(item);
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ center: value, items: [item] });
    } else {
      last.items.push(item);
      last.center = last.items.reduce((sum, candidate) => sum + coordinate(candidate), 0) / last.items.length;
    }
  }
  return clusters;
}

function nativeSource(image = {}, atom = {}, understanding = {}, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: "diagram-zone",
    atomId: atom.id || null,
    atomKind: atom.kind || null,
    relationshipArchetype: understanding.archetype || null,
    confidence: atom.density ?? understanding.confidence ?? null,
    ...extra
  };
}

function validBox(value) {
  if (!value || typeof value !== "object") return null;
  const box = { x: Number(value.x), y: Number(value.y), w: Number(value.w), h: Number(value.h) };
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  if (box.w <= 0 || box.h <= 0 || Math.max(Math.abs(box.x), Math.abs(box.y), box.w, box.h) > 1e7) return null;
  return box;
}

function containsBox(outer = {}, inner = {}, padding = 0) {
  return inner.x >= outer.x - padding
    && inner.y >= outer.y - padding
    && inner.x + inner.w <= outer.x + outer.w + padding
    && inner.y + inner.h <= outer.y + outer.h + padding;
}

function boxArea(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function intersectionArea(left = {}, right = {}) {
  const width = Math.max(0, Math.min(Number(left.x || 0) + Number(left.w || 0), Number(right.x || 0) + Number(right.w || 0))
    - Math.max(Number(left.x || 0), Number(right.x || 0)));
  const height = Math.max(0, Math.min(Number(left.y || 0) + Number(left.h || 0), Number(right.y || 0) + Number(right.h || 0))
    - Math.max(Number(left.y || 0), Number(right.y || 0)));
  return width * height;
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function spread(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length > 1 ? Math.max(...finite) - Math.min(...finite) : 0;
}

function roundedBox(box = {}) {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

function safeColor(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toUpperCase() : fallback;
}

function safeId(value) {
  const text = String(value || "layer").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return text.slice(0, 96) || "layer";
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = { cycleDonutSegmentPoints, cyclePointOnUnitCircle, cyclePointOnBox, normalizeDegrees, lineBox, boxCenter, clusterByCoordinate, nativeSource, validBox, containsBox, boxArea, intersectionArea, median, spread, roundedBox, safeColor, safeId, round };
