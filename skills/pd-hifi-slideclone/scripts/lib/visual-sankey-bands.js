"use strict";

function detectSemanticSankeyBands(components = [], region = {}, semanticHint = "") {
  if (!isSankeySemantic(semanticHint)) return [];
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return (components || [])
    .map((component) => sankeyBandCandidate(component, region, regionArea))
    .filter(Boolean)
    .sort((left, right) => Number(left.box?.x || 0) - Number(right.box?.x || 0)
      || Number(left.sankeyBand?.sourceCenterY || 0) - Number(right.sankeyBand?.sourceCenterY || 0))
    .slice(0, 32);
}

function detectSemanticSankeyNodes(components = [], region = {}, semanticHint = "") {
  if (!isSankeySemantic(semanticHint)) return [];
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const nodes = (components || []).filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    const areaRatio = width * height / regionArea;
    return width >= 5
      && width <= Math.max(34, Number(region.w || 0) * 0.075)
      && height >= Math.max(18, Number(region.h || 0) * 0.07)
      && height >= width * 1.35
      && density >= 0.78
      && areaRatio >= 0.001
      && areaRatio <= 0.09;
  }).map((component) => ({
    ...component,
    kind: "native-rect-candidate",
    shapeHint: "sankey-node",
    semanticChartPart: true,
    semanticSankeyNode: true
  }));
  if (nodes.length < 3 || nodes.length > 24) return [];
  const centers = nodes.map((node) => Number(node.box?.x || 0) + Number(node.box?.w || 0) / 2).sort((a, b) => a - b);
  const columnCount = clusterNumbers(centers, Math.max(8, Number(region.w || 0) * 0.035)).length;
  return columnCount >= 2 ? nodes : [];
}

function sankeyBandCandidate(component = {}, region = {}, regionArea = 1) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const area = width * height;
  const density = Number(component.pixelCount || 0) / Math.max(1, area);
  const aspect = width / Math.max(1, height);
  if (width < Math.max(36, Number(region.w || 0) * 0.12)
    || height < Math.max(8, Number(region.h || 0) * 0.025)
    || aspect < 1.25
    || area / regionArea < 0.003
    || area / regionArea > 0.38
    || density < 0.12
    || density > 0.94) return null;

  const profile = normalizeProfile(component.colProfile, box);
  if (profile.length < Math.max(18, width * 0.72)) return null;
  const source = endpointProfile(profile, "start");
  const target = endpointProfile(profile, "end");
  if (!source || !target) return null;
  const sourceThickness = source.bottom - source.top + 1;
  const targetThickness = target.bottom - target.top + 1;
  if (sourceThickness < 5 || targetThickness < 5) return null;
  const thicknessRatio = Math.max(sourceThickness, targetThickness) / Math.max(1, Math.min(sourceThickness, targetThickness));
  if (thicknessRatio > 2.8) return null;
  const sourceCenterY = (source.top + source.bottom) / 2;
  const targetCenterY = (target.top + target.bottom) / 2;
  const centerShift = Math.abs(targetCenterY - sourceCenterY);
  const varyingBoundary = profileBoundaryVariation(profile) >= 2;
  if (!varyingBoundary && centerShift < Math.max(3, height * 0.08)) return null;

  const x0 = source.x;
  const x1 = target.x;
  if (x1 - x0 < Math.max(30, Number(region.w || 0) * 0.1)) return null;
  const confidence = clamp(
    0.58
      + Math.min(0.16, profile.length / Math.max(1, width) * 0.16)
      + Math.min(0.12, centerShift / Math.max(1, height) * 0.18)
      + Math.min(0.08, Math.min(sourceThickness, targetThickness) / Math.max(1, height) * 0.18),
    0,
    0.94
  );
  return {
    ...component,
    kind: "native-sankey-band-candidate",
    shapeHint: "sankey-flow-band",
    semanticChartPart: true,
    sankeyBand: {
      sourceTop: source.top,
      sourceBottom: source.bottom,
      sourceCenterY,
      targetTop: target.top,
      targetBottom: target.bottom,
      targetCenterY,
      sourceX: x0,
      targetX: x1,
      sourceThickness,
      targetThickness,
      confidence
    }
  };
}

function normalizeProfile(profile = [], box = {}) {
  const left = Number(box.x || 0);
  const right = left + Number(box.w || 0) - 1;
  return (Array.isArray(profile) ? profile : [])
    .map((column) => ({
      x: Number(column?.x),
      top: Number(column?.minY),
      bottom: Number(column?.maxY),
      count: Number(column?.count || 0)
    }))
    .filter((column) => [column.x, column.top, column.bottom].every(Number.isFinite)
      && column.x >= left
      && column.x <= right
      && column.bottom >= column.top
      && column.count >= Math.max(3, (column.bottom - column.top + 1) * 0.65))
    .sort((a, b) => a.x - b.x);
}

function endpointProfile(profile = [], side) {
  if (profile.length === 0) return null;
  const span = Math.max(3, Math.min(12, Math.ceil(profile.length * 0.06)));
  const sample = side === "end" ? profile.slice(-span) : profile.slice(0, span);
  if (sample.length < 3) return null;
  return {
    x: side === "end" ? median(sample.map((column) => column.x)) : median(sample.map((column) => column.x)),
    top: median(sample.map((column) => column.top)),
    bottom: median(sample.map((column) => column.bottom))
  };
}

function profileBoundaryVariation(profile = []) {
  if (profile.length < 5) return 0;
  const sampleCount = Math.min(9, profile.length);
  const centers = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const position = Math.round(index * (profile.length - 1) / Math.max(1, sampleCount - 1));
    const column = profile[position];
    centers.push((column.top + column.bottom) / 2);
  }
  return Math.max(...centers) - Math.min(...centers);
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function clusterNumbers(values = [], tolerance = 1) {
  const clusters = [];
  for (const value of values) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ center: value, values: [value] });
    } else {
      last.values.push(value);
      last.center = last.values.reduce((sum, item) => sum + item, 0) / last.values.length;
    }
  }
  return clusters;
}

function isSankeySemantic(value) {
  return /sankey|alluvial|flow[-_\s]?(?:distribution|composition)|energy[-_\s]?flow|桑基图|流向图|流量分布|能量流/i.test(String(value || ""));
}

module.exports = {
  detectSemanticSankeyBands,
  detectSemanticSankeyNodes,
  _private: { endpointProfile, normalizeProfile, profileBoundaryVariation, sankeyBandCandidate }
};
