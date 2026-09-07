"use strict";

const { boxContains, clamp, inAnyMask, intersectionArea, median, rgbToHex, unionBox } = require("./visual-atom-utils");
const { inferDiagonalLineEndpoints, looksLikeDiagonalLine, looksLikeLine, looksLikeSearchIcon } = require("./visual-atom-shape-recognition");
const { isForegroundPixel } = require("./visual-atom-line-components");
const { foregroundComponentsBySeedColor } = require("./visual-atom-components");

function detectSemanticConvergenceLineComponents(components = [], region = {}, searchComponents = [], semanticHint = "") {
  const semantic = /lens|magnifier|focus|converge|analysis|放大镜|聚焦|收敛|分析|需求/.test(String(semanticHint || "").toLowerCase());
  if (!semantic && searchComponents.length === 0) return [];
  return components
    .filter((component) => {
      const overlapsFocus = searchComponents.some((search) =>
        intersectionArea(component.box, search.box) / Math.max(1, Math.min(
          component.box.w * component.box.h,
          search.box.w * search.box.h
        )) >= 0.72);
      if (overlapsFocus) return false;
      const longEnough = Math.max(Number(component.box?.w || 0), Number(component.box?.h || 0))
        >= Math.min(Number(region.w || 0), Number(region.h || 0)) * 0.28;
      return longEnough && (looksLikeLine(component, region) || looksLikeDiagonalLine(component, region));
    })
    .map((component) => {
      const diagonal = looksLikeDiagonalLine(component, region);
      return {
        ...component,
        kind: "connector-line-candidate",
        shapeHint: diagonal ? "line-diagonal" : "line",
        ...(diagonal ? { lineEndpointsPx: inferDiagonalLineEndpoints(component) } : {}),
        semanticConvergencePart: true
      };
    })
    .slice(0, 8);
}

function detectSemanticVennComponents(components = [], region = {}, semanticHint = "") {
  if (!/venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠/.test(String(semanticHint || "").toLowerCase())) return [];
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const candidates = components
    .filter((component) => {
      const box = component?.box || {};
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
      const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
      return Number(box.w || 0) >= 48
        && Number(box.h || 0) >= 48
        && aspect >= 0.75
        && aspect <= 2.1
        && areaRatio >= 0.025
        && areaRatio <= 0.32
        && density >= 0.45
        && density <= 0.88;
    })
    .sort((left, right) => Number(left.box?.x || 0) - Number(right.box?.x || 0));
  if (candidates.length < 2 || candidates.length > 5) return [];
  const referenceHeight = median(candidates.map((component) => Number(component.box.h || 0)));
  if (referenceHeight <= 0 || candidates.some((component) => Math.abs(Number(component.box.h || 0) - referenceHeight) > referenceHeight * 0.12)) return [];
  const complete = candidates.filter((component) => {
    const density = Number(component.pixelCount || 0) / Math.max(1, Number(component.box.w || 0) * Number(component.box.h || 0));
    return density >= 0.71 && density <= 0.84 && Number(component.box.w || 0) >= referenceHeight * 1.05;
  });
  if (complete.length === 0) return [];
  const referenceWidth = median(complete.map((component) => Number(component.box.w || 0)));
  if (referenceWidth < referenceHeight * 0.9 || referenceWidth > referenceHeight * 1.9) return [];
  const completeCenters = complete.map((component) => Number(component.box.x || 0) + Number(component.box.w || 0) / 2);
  return candidates.map((component) => {
    const observed = component.box;
    const observedWidth = Number(observed.w || 0);
    const observedCenter = Number(observed.x || 0) + observedWidth / 2;
    const nearestCompleteCenter = completeCenters
      .slice()
      .sort((left, right) => Math.abs(left - observedCenter) - Math.abs(right - observedCenter))[0];
    const truncated = observedWidth < referenceWidth * 0.9;
    const recoveredX = truncated && observedCenter > nearestCompleteCenter
      ? Number(observed.x || 0) + observedWidth - referenceWidth
      : Number(observed.x || 0);
    const recoveredBox = {
      x: Math.round(recoveredX),
      y: Number(observed.y || 0),
      w: Math.round(referenceWidth),
      h: Number(observed.h || 0)
    };
    const observedCoverage = component.pixelCount / Math.max(1, Math.PI * recoveredBox.w * recoveredBox.h / 4);
    return {
      ...component,
      box: recoveredBox,
      kind: "native-venn-ellipse-candidate",
      shapeHint: "ellipse",
      semanticChartPart: true,
      vennObservedBox: observed,
      vennRecoveryConfidence: truncated
        ? Math.max(0, Math.min(1, observedCoverage / 0.58))
        : Math.max(0, Math.min(1, observedCoverage / 0.82))
    };
  });
}

function detectSemanticConvergenceNodeComponents(components = [], region = {}, searchComponents = []) {
  if (searchComponents.length === 0) return [];
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return components
    .filter((component) => {
      const box = component?.box || {};
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
      const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
      const overlapsFocus = searchComponents.some((search) =>
        intersectionArea(box, search.box) / Math.max(1, Number(box.w || 0) * Number(box.h || 0)) >= 0.55);
      return !overlapsFocus
        && Number(box.w || 0) >= 30
        && Number(box.h || 0) >= 18
        && aspect >= 1.4
        && aspect <= 5
        && areaRatio >= 0.006
        && areaRatio <= 0.12
        && density >= 0.62;
    })
    .map((component) => ({
      ...component,
      kind: "native-rect-candidate",
      shapeHint: "rect",
      semanticConvergencePart: true
    }))
    .slice(0, 8);
}

function detectSemanticSearchComponents(image = {}, region = {}, bg = [], connectedComponents = [], semanticHint = "") {
  const semantic = /lens|magnifier|search|focus|converge|analysis|放大镜|聚焦|收敛|分析|需求/.test(String(semanticHint || "").toLowerCase());
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const visualProbe = connectedComponents.some((component) => {
    const box = component?.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
    const density = Number(component?.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return aspect >= 0.65 && aspect <= 1.65 && areaRatio >= 0.025 && areaRatio <= 0.18 && density >= 0.14 && density <= 0.6;
  });
  if (!semantic && !visualProbe) return [];
  return foregroundComponentsBySeedColor(image, region, bg, [], 24)
    .filter((component) => looksLikeSearchIcon(component))
    .map((component) => ({
      ...component,
      kind: "native-search-candidate",
      shapeHint: "search",
      semanticSearchPart: true
    }))
    .slice(0, 2);
}

function suppressSemanticSearchCompositeComponents(components = [], searchComponents = []) {
  if (searchComponents.length === 0) return components;
  return components.filter((component) => !searchComponents.some((search) => {
    const overlap = intersectionArea(component.box, search.box) / Math.max(1, Math.min(
      component.box.w * component.box.h,
      search.box.w * search.box.h
    ));
    const areaRatio = component.box.w * component.box.h / Math.max(1, search.box.w * search.box.h);
    if (search.semanticConvergencePart === true) {
      const density = Number(component.pixelCount || 0) / Math.max(1, component.box.w * component.box.h);
      return overlap >= 0.82 && areaRatio >= 0.9 && density <= 0.38;
    }
    return overlap >= 0.82 && areaRatio >= 0.65 && areaRatio <= 1.35;
  }));
}

function isSemanticRectChart(value) {
  return /waterfall|variance[-_\s]?bridge|瀑布图|增减分析|treemap|area[-_\s]?composition|矩形树图|面积占比/i.test(String(value || ""));
}

function isSemanticLayeredChart(value) {
  return /gauge|speedometer|仪表盘|速度表|radar|spider[-_\s]?chart|web[-_\s]?chart|雷达图|蛛网图|(?:^|[^a-z])pie(?:[^a-z]|$)|饼图|扇区图|concentric[-_\s]?circles?|onion[-_\s]?diagram|同心圆|洋葱图|圈层模型/i.test(String(value || ""));
}

function isSemanticCycleLoop(value) {
  return /cycle|loop|circular|arc[-_\s]?arrow|闭环|循环|环形|圆弧|弧形|环状/i.test(String(value || ""));
}

function detectSemanticGaugeComponents(components = [], region = {}, semanticHint = "") {
  const explicitGauge = /gauge|speedometer|dial[-_\s]?chart|仪表图|速度表|半圆仪表/i.test(String(semanticHint || ""));
  const candidates = components
    .filter((component) => component?.box && Number(component.pixelCount || 0) >= 80)
    .sort((a, b) => Number(b.pixelCount || 0) - Number(a.pixelCount || 0));
  const arc = candidates.find((component) => {
    const box = component.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return aspect >= (explicitGauge ? 1.45 : 1.65)
      && aspect <= (explicitGauge ? 2.5 : 2.18)
      && density >= 0.12 && density <= 0.68
      && Number(box.w || 0) >= Number(region.w || 0) * 0.16;
  });
  const needle = candidates.find((component) => {
    if (component === arc) return false;
    const box = component.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    if (!(aspect >= 0.45 && aspect <= 3.2 && density >= 0.04 && density <= 0.42)) return false;
    return explicitGauge || (arc && isGaugeNeedleGeometry(component, arc));
  });
  if (!arc || !needle) return [];
  const diameter = Number(arc.box.w || 0);
  const arcBox = { x: arc.box.x, y: arc.box.y, w: diameter, h: diameter };
  const thickness = estimateGaugeRingThickness(arc);
  return [
    {
      ...arc,
      box: arcBox,
      kind: "native-gauge-arc-candidate",
      shapeHint: "gauge-arc",
      gaugeHoleRatio: clamp((diameter - thickness * 2) / Math.max(1, diameter), 0.3, 0.84),
      semanticChartPart: true
    },
    {
      ...needle,
      kind: "native-gauge-needle-candidate",
      shapeHint: "gauge-needle",
      lineEndpointsPx: inferDiagonalLineEndpoints(needle),
      semanticChartPart: true
    }
  ];
}

function isGaugeNeedleGeometry(component = {}, arc = {}) {
  const endpoints = inferDiagonalLineEndpoints(component);
  if (!endpoints?.from || !endpoints?.to || !arc?.box) return false;
  const center = {
    x: Number(arc.box.x || 0) + Number(arc.box.w || 0) / 2,
    y: Number(arc.box.y || 0) + Number(arc.box.h || 0)
  };
  const radius = Math.max(1, Number(arc.box.w || 0) / 2);
  const points = [endpoints.from, endpoints.to]
    .map((point) => ({ ...point, distance: Math.hypot(Number(point.x || 0) - center.x, Number(point.y || 0) - center.y) }))
    .sort((left, right) => left.distance - right.distance);
  return points[0].distance <= radius * 0.16
    && points[1].distance >= radius * 0.28
    && points[1].distance <= radius * 0.94
    && Number(points[1].y || 0) <= center.y + radius * 0.08;
}

function estimateGaugeRingThickness(component = {}) {
  const box = component.box || {};
  const centerX = Math.round(Number(box.x || 0) + Number(box.w || 0) / 2);
  const column = (component.colProfile || []).find((item) => Number(item.x) === centerX);
  if (!column) return Math.max(4, Number(box.h || 0) * 0.25);
  return Math.max(3, Number(column.maxY || 0) - Number(column.minY || 0) + 1);
}

function detectSemanticRadarComponents(components = [], _region = {}, semanticHint = "") {
  if (!/radar|spider[-_\s]?chart|web[-_\s]?chart|雷达图|蛛网图/i.test(String(semanticHint || ""))) return [];
  const polygons = components
    .filter((component) => {
      const box = component?.box || {};
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
      return Number(component.pixelCount || 0) >= 160 && aspect >= 0.65 && aspect <= 1.45 && density >= 0.16 && density <= 0.72;
    })
    .sort((a, b) => Number(b.box?.w || 0) * Number(b.box?.h || 0) - Number(a.box?.w || 0) * Number(a.box?.h || 0));
  if (polygons.length < 2) return [];
  const frame = polygons[0];
  const score = polygons.find((component) => component !== frame && boxContains(frame.box, component.box, 3));
  if (!score) return [];
  const frameVertices = inferRadialPolygonVertices(frame, 5);
  const scoreVertices = inferRadialPolygonVertices(score, 5);
  if (frameVertices.length !== 5 || scoreVertices.length !== 5) return [];
  return [
    {
      ...frame,
      kind: "native-radar-frame-candidate",
      shapeHint: "radar-frame",
      radarVertices: frameVertices,
      semanticChartPart: true
    },
    {
      ...score,
      kind: "native-radar-score-candidate",
      shapeHint: "radar-score",
      radarVertices: scoreVertices,
      semanticChartPart: true
    }
  ];
}

function inferRadialPolygonVertices(component = {}, vertexCount = 5) {
  const box = component.box || {};
  const center = { x: Number(box.x || 0) + Number(box.w || 0) / 2, y: Number(box.y || 0) + Number(box.h || 0) / 2 };
  const boundary = [];
  for (const row of component.rowProfile || []) {
    boundary.push({ x: Number(row.minX || 0), y: Number(row.y || 0) }, { x: Number(row.maxX || 0), y: Number(row.y || 0) });
  }
  for (const column of component.colProfile || []) {
    boundary.push({ x: Number(column.x || 0), y: Number(column.minY || 0) }, { x: Number(column.x || 0), y: Number(column.maxY || 0) });
  }
  const step = 360 / vertexCount;
  return Array.from({ length: vertexCount }, (_, index) => {
    const target = -90 + index * step;
    return boundary
      .map((point) => ({ point, angleDelta: angularDeltaDegrees(Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI, target), radius: Math.hypot(point.x - center.x, point.y - center.y) }))
      .filter((candidate) => candidate.angleDelta <= step * 0.44)
      .sort((a, b) => b.radius - a.radius)[0]?.point || null;
  }).filter(Boolean);
}

function angularDeltaDegrees(left, right) {
  const delta = Math.abs(normalizeAngleDegrees(left) - normalizeAngleDegrees(right));
  return Math.min(delta, 360 - delta);
}

function normalizeAngleDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function suppressSemanticSpecialChartComponents(components = [], semanticParts = []) {
  if (semanticParts.length < 2) return components;
  const union = semanticParts.map((part) => part.box).reduce((current, box) => current ? unionBox(current, box) : box, null);
  return components.filter((component) => {
    if (component.semanticChartPart === true) return true;
    return intersectionArea(component.box, union) / Math.max(1, Number(component.box?.w || 0) * Number(component.box?.h || 0)) < 0.72;
  });
}

function detectSemanticChartRectComponents(components = [], region = {}, semanticHint = "") {
  if (!isSemanticRectChart(semanticHint)) return [];
  const waterfall = /waterfall|variance[-_\s]?bridge|瀑布图|增减分析/i.test(String(semanticHint || ""));
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const rectangles = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const area = width * height;
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    const aspect = width / Math.max(1, height);
    if (width < 8 || height < 8 || density < 0.9 || area / regionArea < 0.003 || area / regionArea > 0.58) return false;
    if (aspect < 0.1 || aspect > 12) return false;
    if (waterfall && width > Number(region.w || 0) * 0.22) return false;
    return true;
  }).map((component) => ({
    ...component,
    kind: "native-rect-candidate",
    shapeHint: waterfall ? "bar" : "rect",
      semanticRectChartPart: true,
      semanticChartPart: true
  }));
  const minimum = waterfall ? 4 : 3;
  return rectangles.length >= minimum && rectangles.length <= 64 ? rectangles : [];
}

function suppressSemanticRectChartCompositeComponents(components = [], semanticParts = []) {
  if (semanticParts.length < 3) return components;
  return components.filter((component) => {
    if (component.semanticRectChartPart === true) return true;
    const children = semanticParts.filter((part) => boxContains(component.box, part.box, 2));
    if (children.length < 3) return true;
    const area = Number(component.box?.w || 0) * Number(component.box?.h || 0);
    const childArea = children.reduce((sum, child) => sum + Number(child.box?.w || 0) * Number(child.box?.h || 0), 0);
    return childArea < area * 0.35;
  });
}

function detectBaselineColumnBarComponents(image, region, bg, masks, axisLines = []) {
  const horizontalAxes = axisLines
    .filter((line) => line.axis === "h" && Number(line.box?.y || 0) >= region.y + region.h * 0.48)
    .sort((a, b) => Number(b.box?.w || 0) - Number(a.box?.w || 0));
  const axis = horizontalAxes[0];
  const baseline = axis
    ? Math.round(Number(axis.box.y || 0))
    : detectDenseHorizontalBaseline(image, region, bg, masks);
  if (!Number.isFinite(baseline)) return [];
  const minimumHeight = Math.max(12, Math.round(region.h * 0.06));
  const columns = [];
  for (let x = region.x; x < region.x + region.w; x += 1) {
    let height = 0;
    for (let y = baseline - 1; y >= region.y; y -= 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) break;
      height += 1;
    }
    if (height >= minimumHeight) columns.push({ x, height });
  }
  const groups = [];
  for (const column of columns) {
    const last = groups[groups.length - 1];
    if (!last || column.x > last[last.length - 1].x + 1) groups.push([column]);
    else last.push(column);
  }
  const bars = groups.map((group) => {
    const width = group.length;
    const height = Math.round(median(group.map((column) => column.height)));
    if (width < Math.max(8, region.w * 0.015) || width > region.w * 0.2) return null;
    const x = group[0].x;
    const y = baseline - height;
    const offset = (Math.max(region.y, y + Math.floor(height / 2)) * image.width + Math.min(image.width - 1, x + Math.floor(width / 2))) * 4;
    return {
      box: { x, y, w: width, h: height },
      pixelCount: width * height,
      color: rgbToHex([image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]),
      kind: "native-rect-candidate",
      shapeHint: "bar",
      columnBarPart: true
    };
  }).filter(Boolean);
  if (bars.length < 3 || bars.length > 16) return [];
  const heights = bars.map((bar) => bar.box.h);
  if (Math.max(...heights) - Math.min(...heights) < Math.max(16, region.h * 0.07)) return [];
  if (axis) return bars;
  const inferredAxis = inferHorizontalAxisAtBaseline(image, region, bg, masks, baseline);
  return inferredAxis ? [...bars, inferredAxis] : bars;
}

function inferHorizontalAxisAtBaseline(image, region, bg, masks, baseline) {
  let minX = null;
  let maxX = null;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let x = region.x; x < region.x + region.w; x += 1) {
    if (inAnyMask(x, baseline, masks) || !isForegroundPixel(image, x, baseline, bg)) continue;
    const offset = (baseline * image.width + x) * 4;
    minX = minX === null ? x : Math.min(minX, x);
    maxX = maxX === null ? x : Math.max(maxX, x);
    sumR += image.rgba[offset];
    sumG += image.rgba[offset + 1];
    sumB += image.rgba[offset + 2];
    count += 1;
  }
  if (minX === null || maxX - minX + 1 < region.w * 0.42) return null;
  const thickness = measureHorizontalLineThickness(image, region, bg, masks, baseline, minX, maxX);
  return {
    box: { x: minX, y: baseline, w: maxX - minX + 1, h: thickness },
    pixelCount: count,
    color: rgbToHex([
      Math.round(sumR / Math.max(1, count)),
      Math.round(sumG / Math.max(1, count)),
      Math.round(sumB / Math.max(1, count))
    ]),
    kind: "grid-line-candidate",
    shapeHint: "grid-line-horizontal",
    axis: "h",
    inferredChartBaseline: true
  };
}

function measureHorizontalLineThickness(image, region, bg, masks, baseline, minX, maxX) {
  const sampleX = Math.round((minX + maxX) / 2);
  let thickness = 0;
  for (let y = baseline; y < Math.min(region.y + region.h, baseline + 12); y += 1) {
    if (inAnyMask(sampleX, y, masks) || !isForegroundPixel(image, sampleX, y, bg)) break;
    thickness += 1;
  }
  return Math.max(3, thickness);
}

function detectDenseHorizontalBaseline(image, region, bg, masks) {
  const candidates = [];
  const startY = Math.round(region.y + region.h * 0.48);
  for (let y = startY; y < region.y + region.h; y += 1) {
    let count = 0;
    let minX = null;
    let maxX = null;
    for (let x = region.x; x < region.x + region.w; x += 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      count += 1;
      minX = minX === null ? x : Math.min(minX, x);
      maxX = maxX === null ? x : Math.max(maxX, x);
    }
    const span = minX === null ? 0 : maxX - minX + 1;
    if (span >= region.w * 0.42 && count / Math.max(1, span) >= 0.55) candidates.push({ y, span });
  }
  if (candidates.length === 0) return null;
  const longest = Math.max(...candidates.map((candidate) => candidate.span));
  const matching = candidates.filter((candidate) => candidate.span >= longest * 0.94);
  return Math.min(...matching.map((candidate) => candidate.y));
}

function suppressColumnChartCompositeComponents(components = [], bars = []) {
  const columnBars = bars.filter((bar) => bar.columnBarPart === true);
  if (columnBars.length < 3) return components;
  return components.filter((component) => {
    const containedBars = columnBars.filter((bar) => boxContains(component.box, bar.box, 2));
    if (containedBars.length < 3) return true;
    const area = Number(component.box?.w || 0) * Number(component.box?.h || 0);
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    return density > 0.68;
  });
}

module.exports = {
  detectSemanticConvergenceLineComponents,
  detectSemanticVennComponents,
  detectSemanticConvergenceNodeComponents,
  detectSemanticSearchComponents,
  suppressSemanticSearchCompositeComponents,
  isSemanticRectChart,
  isSemanticLayeredChart,
  isSemanticCycleLoop,
  detectSemanticGaugeComponents,
  isGaugeNeedleGeometry,
  estimateGaugeRingThickness,
  detectSemanticRadarComponents,
  inferRadialPolygonVertices,
  angularDeltaDegrees,
  normalizeAngleDegrees,
  suppressSemanticSpecialChartComponents,
  detectSemanticChartRectComponents,
  suppressSemanticRectChartCompositeComponents,
  detectBaselineColumnBarComponents,
  inferHorizontalAxisAtBaseline,
  measureHorizontalLineThickness,
  detectDenseHorizontalBaseline,
  suppressColumnChartCompositeComponents
};
