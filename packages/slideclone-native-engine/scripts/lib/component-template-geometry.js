"use strict";

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function clampBox(box, slideSize = DEFAULT_SLIDE) {
  if (!box || typeof box !== "object") return null;
  const maxW = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const maxH = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const x = clampNumber(box.x, -maxW, maxW * 2, 0);
  const y = clampNumber(box.y, -maxH, maxH * 2, 0);
  const w = clampNumber(box.w, 0.1, maxW * 2, 0.1);
  const h = clampNumber(box.h, 0.1, maxH * 2, 0.1);
  return {
    x: round(Math.max(0, Math.min(x, maxW))),
    y: round(Math.max(0, Math.min(y, maxH))),
    w: round(Math.max(0.1, Math.min(w, maxW - Math.max(0, Math.min(x, maxW))))),
    h: round(Math.max(0.1, Math.min(h, maxH - Math.max(0, Math.min(y, maxH)))))
  };
}

function boxOverlapArea(a = {}, b = {}) {
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function unionBox(boxes = []) {
  const valid = boxes.filter((box) => box && Number(box.w || 0) > 0 && Number(box.h || 0) > 0);
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((box) => Number(box.x || 0)));
  const top = Math.min(...valid.map((box) => Number(box.y || 0)));
  const right = Math.max(...valid.map((box) => Number(box.x || 0) + Number(box.w || 0)));
  const bottom = Math.max(...valid.map((box) => Number(box.y || 0) + Number(box.h || 0)));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function isInsideUnitBox(box = {}) {
  if (!box || typeof box !== "object") return false;
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  const h = Number(box.h);
  if (![x, y, w, h].every(Number.isFinite)) return false;
  return w > 0 && h > 0 && x >= -0.05 && y >= -0.05 && x + w <= 1.05 && y + h <= 1.05;
}

function scaleRelativeBox(relative = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  if (!relative || typeof relative !== "object") return null;
  return clampBox({
    x: targetBox.x + Number(relative.x || 0) * targetBox.w,
    y: targetBox.y + Number(relative.y || 0) * targetBox.h,
    w: Number(relative.w || 0) * targetBox.w,
    h: Number(relative.h || 0) * targetBox.h
  }, slideSize);
}

function isUsefulTemplateNodeBox(box, targetBox) {
  if (!box || box.w <= 4 || box.h <= 4) return false;
  const areaRatio = (box.w * box.h) / Math.max(1, targetBox.w * targetBox.h);
  const widthRatio = box.w / Math.max(1, targetBox.w);
  const heightRatio = box.h / Math.max(1, targetBox.h);
  return areaRatio >= 0.003
    && areaRatio <= 0.22
    && widthRatio >= 0.025
    && heightRatio >= 0.025
    && widthRatio <= 0.68
    && heightRatio <= 0.68;
}

function boxCenter(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

function distance(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function angleAround(center, point) {
  return Math.atan2(Number(point.y || 0) - Number(center.y || 0), Number(point.x || 0) - Number(center.x || 0));
}

function lineBoxBetween(aBox = {}, bBox = {}) {
  const a = boxCenter(aBox);
  const b = boxCenter(bBox);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.max(0.1, Math.abs(b.x - a.x)),
    h: Math.max(0.1, Math.abs(b.y - a.y))
  };
}

function anchorAxisBetween(fromBox = {}, toBox = {}) {
  const from = boxCenter(fromBox);
  const to = boxCenter(toBox);
  return Math.abs(to.y - from.y) > Math.abs(to.x - from.x) * 1.2 ? "vertical" : "horizontal";
}

function radialAnchor(from = {}, to = {}) {
  const dx = Number(to.x || 0) - Number(from.x || 0);
  const dy = Number(to.y || 0) - Number(from.y || 0);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max, min));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

module.exports = {
  angleAround,
  anchorAxisBetween,
  boxCenter,
  boxOverlapArea,
  clampBox,
  clampInteger,
  clampNumber,
  distance,
  isInsideUnitBox,
  isUsefulTemplateNodeBox,
  lineBoxBetween,
  radialAnchor,
  round,
  scaleRelativeBox,
  unionBox
};
