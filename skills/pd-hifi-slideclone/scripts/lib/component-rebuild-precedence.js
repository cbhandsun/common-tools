"use strict";

function shouldPreferAppliedPluginComponent({
  componentImages = [],
  sourceImages = [],
  allowUnverifiedPrototypeReplay = false
} = {}) {
  const sources = Array.isArray(sourceImages) ? sourceImages.filter((image) => validBox(image?.box)) : [];
  if (sources.length === 0) return false;

  return (Array.isArray(componentImages) ? componentImages : []).some((image) => {
    if (!validBox(image?.box) || !overlapsAnySource(image.box, sources)) return false;
    const source = image?.source || {};
    if (String(source.componentAssetReadiness?.status || "").toLowerCase() !== "applied-plugin-motif-ready") return false;
    if (source.componentTemplateVisualVerified !== true && allowUnverifiedPrototypeReplay !== true) return false;

    return (Array.isArray(source.componentLocalAssets) ? source.componentLocalAssets : []).some((asset) => {
      if (!Array.isArray(asset?.roleTags) || !asset.roleTags.includes("applied-component")) return false;
      return (Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [])
        .some(isHighConfidenceEditableGroup);
    });
  });
}

function isHighConfidenceEditableGroup(group = {}) {
  const readiness = String(group?.reuseReadiness?.level || "").toLowerCase();
  const score = finiteNumber(group?.matchScore ?? group?.score ?? group?.componentScore, 0);
  const shapeCount = finiteNumber(group?.shapeCount ?? group?.childCount, 0);
  const connectorCount = finiteNumber(group?.connectorCount, 0);
  const pictureCount = finiteNumber(group?.pictureCount, 0);
  return readiness === "high"
    && score >= 80
    && shapeCount >= 6
    && pictureCount === 0
    && (connectorCount > 0 || shapeCount >= 12);
}

function overlapsAnySource(box, sources) {
  const area = box.w * box.h;
  return sources.some((source) => intersectionArea(box, source.box) / Math.max(1, Math.min(area, source.box.w * source.box.h)) >= 0.58);
}

function intersectionArea(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function validBox(box = {}) {
  return [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

module.exports = {
  shouldPreferAppliedPluginComponent,
  _private: {
    intersectionArea,
    isHighConfidenceEditableGroup,
    validBox
  }
};
