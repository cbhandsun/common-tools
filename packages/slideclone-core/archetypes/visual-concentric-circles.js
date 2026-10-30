"use strict";

const MAX_COMPONENTS = 96;

function detectSemanticConcentricCircles(components = [], region = {}, semanticHint = "") {
  if (!isConcentricSemanticHint(semanticHint) || !validRegion(region)) return [];
  if (!Array.isArray(components) || components.length < 2 || components.length > MAX_COMPONENTS) return [];
  const regionArea = Number(region.w) * Number(region.h);
  const candidates = components
    .filter((component) => validCircleLayer(component, region, regionArea))
    .sort((left, right) => boxArea(right.box) - boxArea(left.box));
  if (candidates.length < 2) return [];

  for (const outer of candidates) {
    const center = boxCenter(outer.box);
    const layers = candidates
      .filter((component) => centersAlign(center, boxCenter(component.box), outer.box))
      .filter((component) => containsBox(outer.box, component.box, 4))
      .sort((left, right) => boxArea(right.box) - boxArea(left.box));
    if (!validLayerSequence(layers)) continue;
    return layers.map((component, index) => ({
      ...component,
      kind: "native-concentric-circle-candidate",
      shapeHint: "concentric-circle-layer",
      concentricLayerIndex: index,
      concentricLayerCount: layers.length,
      semanticChartPart: true
    }));
  }
  return [];
}

function isConcentricSemanticHint(value) {
  return /concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|圈层模型|圈层结构/i.test(String(value || ""));
}

function validRegion(region) {
  return [region?.x, region?.y, region?.w, region?.h].every(Number.isFinite)
    && Number(region.w) >= 16 && Number(region.h) >= 16
    && Number(region.w) * Number(region.h) <= 24_000_000;
}

function validCircleLayer(component, region, regionArea) {
  const box = component?.box || {};
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return false;
  const width = Number(box.w);
  const height = Number(box.h);
  const area = width * height;
  const density = Number(component.pixelCount) / Math.max(1, area);
  const aspect = width / Math.max(1, height);
  return component.colorSeparated === true
    && /^#[0-9a-f]{6}$/i.test(String(component.color || ""))
    && width >= Number(region.w) * 0.08
    && height >= Number(region.h) * 0.08
    && aspect >= 0.72 && aspect <= 1.38
    && area / regionArea >= 0.008 && area / regionArea <= 0.72
    && density >= 0.14 && density <= 0.9;
}

function validLayerSequence(layers) {
  if (layers.length < 2 || layers.length > 8) return false;
  const colors = new Set(layers.map((layer) => String(layer.color).toLowerCase()));
  if (colors.size !== layers.length) return false;
  for (let index = 1; index < layers.length; index += 1) {
    const outer = layers[index - 1].box;
    const inner = layers[index].box;
    const widthRatio = Number(inner.w) / Number(outer.w);
    const heightRatio = Number(inner.h) / Number(outer.h);
    if (!containsBox(outer, inner, 4)) return false;
    if (widthRatio < 0.28 || widthRatio > 0.88 || heightRatio < 0.28 || heightRatio > 0.88) return false;
  }
  return true;
}

function centersAlign(left, right, outerBox) {
  const tolerance = Math.max(5, Math.min(Number(outerBox.w), Number(outerBox.h)) * 0.055);
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y)) <= tolerance;
}

function containsBox(outer, inner, tolerance = 0) {
  return Number(inner.x) >= Number(outer.x) - tolerance
    && Number(inner.y) >= Number(outer.y) - tolerance
    && Number(inner.x) + Number(inner.w) <= Number(outer.x) + Number(outer.w) + tolerance
    && Number(inner.y) + Number(inner.h) <= Number(outer.y) + Number(outer.h) + tolerance;
}

function boxCenter(box) {
  return { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y) + Number(box.h) / 2 };
}

function boxArea(box) {
  return Number(box.w) * Number(box.h);
}

module.exports = { detectSemanticConcentricCircles, isConcentricSemanticHint };
