"use strict";

const MAX_COMPONENTS = 96;

function detectSemanticQuadrantPanels(components = [], region = {}, semanticHint = "") {
  if (!isQuadrantSemanticHint(semanticHint) || !validRegion(region)) return [];
  if (!Array.isArray(components) || components.length < 4 || components.length > MAX_COMPONENTS) return [];
  const regionArea = Number(region.w) * Number(region.h);
  const panels = components
    .filter((component) => validPanel(component, region, regionArea))
    .sort((left, right) => boxCenter(left.box).y - boxCenter(right.box).y || boxCenter(left.box).x - boxCenter(right.box).x);
  if (panels.length !== 4) return [];
  const xClusters = clusterCenters(panels, "x", Number(region.w) * 0.12);
  const yClusters = clusterCenters(panels, "y", Number(region.h) * 0.12);
  if (xClusters.length !== 2 || yClusters.length !== 2) return [];
  if (!xClusters.every((cluster) => cluster.items.length === 2) || !yClusters.every((cluster) => cluster.items.length === 2)) return [];
  const cells = new Set(panels.map((panel) => `${nearestCluster(boxCenter(panel.box).x, xClusters)}:${nearestCluster(boxCenter(panel.box).y, yClusters)}`));
  if (cells.size !== 4) return [];
  return panels.map((component, index) => ({
    ...component,
    kind: "native-quadrant-panel-candidate",
    shapeHint: "quadrant-panel",
    quadrantRow: nearestCluster(boxCenter(component.box).y, yClusters),
    quadrantColumn: nearestCluster(boxCenter(component.box).x, xClusters),
    semanticChartPart: true,
    quadrantPanelIndex: index
  }));
}

function isQuadrantSemanticHint(value) {
  return /quadrant|impact[-_\s]?effort|priority[-_\s]?matrix|four[-_\s]?quadrants?|四象限|象限图|优先级矩阵|影响.?投入|价值.?难度/i.test(String(value || ""));
}

function validRegion(region) {
  return [region?.x, region?.y, region?.w, region?.h].every(Number.isFinite)
    && Number(region.w) >= 40 && Number(region.h) >= 40
    && Number(region.w) * Number(region.h) <= 24_000_000;
}

function validPanel(component, region, regionArea) {
  const box = component?.box || {};
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return false;
  const width = Number(box.w);
  const height = Number(box.h);
  const area = width * height;
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount) / Math.max(1, area);
  return component.colorSeparated === true
    && /^#[0-9a-f]{6}$/i.test(String(component.color || ""))
    && width >= Number(region.w) * 0.12 && width <= Number(region.w) * 0.42
    && height >= Number(region.h) * 0.08 && height <= Number(region.h) * 0.32
    && area / regionArea >= 0.012 && area / regionArea <= 0.16
    && aspect >= 1.1 && aspect <= 5
    && density >= 0.82;
}

function clusterCenters(items, axis, tolerance) {
  const clusters = [];
  for (const item of items) {
    const value = boxCenter(item.box)[axis];
    let cluster = clusters.find((entry) => Math.abs(entry.center - value) <= tolerance);
    if (!cluster) {
      cluster = { center: value, items: [] };
      clusters.push(cluster);
    }
    cluster.items.push(item);
    cluster.center = cluster.items.reduce((sum, entry) => sum + boxCenter(entry.box)[axis], 0) / cluster.items.length;
  }
  return clusters.sort((left, right) => left.center - right.center);
}

function nearestCluster(value, clusters) {
  let bestIndex = 0;
  for (let index = 1; index < clusters.length; index += 1) {
    if (Math.abs(clusters[index].center - value) < Math.abs(clusters[bestIndex].center - value)) bestIndex = index;
  }
  return bestIndex;
}

function boxCenter(box) {
  return { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y) + Number(box.h) / 2 };
}

module.exports = { detectSemanticQuadrantPanels, isQuadrantSemanticHint };
