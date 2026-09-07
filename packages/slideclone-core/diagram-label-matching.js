"use strict";
const {centerOfBox} = require("./raster-native-detection");

function normalizeMatrixLabel(value) {
  return String(value || "").replace(/\s+/g, "").replace(/PMPortalSkills/g, "PM Portal Skills").trim();
}

function nearestNumericIndex(value, candidates) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, candidate] of (Array.isArray(candidates) ? candidates : []).entries()) {
    const distance = Math.abs(Number(value) - Number(candidate));
    if (Number.isFinite(distance) && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function sameDiagramLabel(a = {}, b = {}) {
  const aText = normalizeMatrixLabel(a.text);
  const bText = normalizeMatrixLabel(b.text);
  if (!aText || !bText || aText !== bText) return false;
  const ac = centerOfBox(a.box);
  const bc = centerOfBox(b.box);
  return Math.abs(ac.x - bc.x) <= 12 && Math.abs(ac.y - bc.y) <= 12;
}

function normalizeStructuredCaseMatrixText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[：:，,。.;；]+$/g, "")
    .trim();
}

function normalizeTextKey(text) {
  return String(text || "").replace(/\s+/g, "").trim();
}

function distanceBetweenBoxCenters(left = {}, right = {}) {
  const leftCenter = centerOfBox(left);
  const rightCenter = centerOfBox(right);
  return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
}

module.exports = {normalizeTextKey, normalizeStructuredCaseMatrixText, distanceBetweenBoxCenters, normalizeMatrixLabel, sameDiagramLabel, nearestNumericIndex};
