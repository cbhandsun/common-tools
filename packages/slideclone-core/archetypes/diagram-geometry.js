"use strict";

const { DEFAULT_SLIDE } = require("./diagram-constants");

function distanceToCentroid(node, nodes) {
  const centroid = {
    x: nodes.reduce((sum, item) => sum + item.center.x, 0) / Math.max(1, nodes.length),
    y: nodes.reduce((sum, item) => sum + item.center.y, 0) / Math.max(1, nodes.length)
  };
  return distance(node.center, centroid);
}

function dispersion(nodes, slideSize = DEFAULT_SLIDE) {
  if (nodes.length < 2) return 0;
  const xs = nodes.map((node) => node.center.x);
  const ys = nodes.map((node) => node.center.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return Math.max(width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt), height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt));
}

function overlapRatio(a = {}, b = {}) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = Math.max(1, Number(a.w || 0) * Number(a.h || 0));
  return intersection / area;
}

function boxArea(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function boxCenterInside(inner = {}, outer = {}) {
  const center = centerOf(inner);
  return center.x >= Number(outer.x || 0)
    && center.x <= Number(outer.x || 0) + Number(outer.w || 0)
    && center.y >= Number(outer.y || 0)
    && center.y <= Number(outer.y || 0) + Number(outer.h || 0);
}

function centerOf(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

function distance(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function average(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function median(values = []) {
  const sorted = values.map((value) => Number(value || 0)).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function ptBoxOverlapAreaValue(a = {}, b = {}) {
  const ax = Number(a.x || 0);
  const ay = Number(a.y || 0);
  const aw = Number(a.w || 0);
  const ah = Number(a.h || 0);
  const bx = Number(b.x || 0);
  const by = Number(b.y || 0);
  const bw = Number(b.w || 0);
  const bh = Number(b.h || 0);
  if (![ax, ay, aw, ah, bx, by, bw, bh].every(Number.isFinite) || aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) {
    return 0;
  }
  const w = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const h = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  return w * h;
}

module.exports = { ptBoxOverlapAreaValue,
  distanceToCentroid,
  dispersion,
  overlapRatio,
  boxArea,
  boxCenterInside,
  centerOf,
  distance,
  average,
  median,
  clamp,
  round
};
