"use strict";

const { average, median, round } = require("./visual-atom-utils");
const { DEFAULT_SLIDE } = require("./visual-atom-constants");

function dedupeComponentPriority(component) {
  if (component?.semanticRectChartPart === true || component?.semanticChartPart === true) return -2;
  if (!component?.kind && looksLikeTimeline(component, { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY })) return -1;
  if (!component?.kind && looksLikeDiagonalLine(component, component.box || {})) return -1;
  if (!component?.kind && looksLikeCycleArrow(component)) return -1;
  if (!component?.kind && looksLikePerson(component)) return -1;
  if (!component?.kind && looksLikeFunnel(component)) return -1;
  return component?.kind === "grid-line-candidate" ? 0 : 1;
}

function isUsefulAtom(component, region) {
  const area = component.box.w * component.box.h;
  const regionArea = Math.max(1, region.w * region.h);
  if (area < 32) return false;
  if (component.box.w < 3 || component.box.h < 3) return false;
  if (area / regionArea > 0.75) return false;
  return true;
}

function classifyAtom(component, region, shapeHint = inferShapeHint(component, region)) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const areaRatio = w * h / Math.max(1, region.w * region.h);
  const density = component.pixelCount / Math.max(1, w * h);
  if (shapeHint === "timeline") return "native-timeline-candidate";
  if (shapeHint === "arrow-horizontal" || shapeHint === "arrow-vertical") return "connector-arrow-candidate";
  if (shapeHint === "line-diagonal") return "connector-line-candidate";
  if (shapeHint === "line" && aspect >= 4 && density >= 0.72 && h >= Math.max(12, Number(region.h || 0) * 0.04) && areaRatio >= 0.008) {
    return "native-rect-candidate";
  }
  if ((aspect >= 7 && h <= Math.max(10, region.h * 0.08)) || (aspect <= 0.14 && w <= Math.max(10, region.w * 0.08))) {
    return isGridLikeLine(component, region) ? "grid-line-candidate" : "connector-line-candidate";
  }
  if (shapeHint === "pill" && areaRatio >= 0.012 && density >= 0.28 && aspect >= 2.4) return "native-rect-candidate";
  if (shapeHint === "ellipse") return "native-ellipse-candidate";
  if (shapeHint === "diamond") return "native-diamond-candidate";
  if (shapeHint === "triangle") return "native-triangle-candidate";
  if (shapeHint === "chevron-right" || shapeHint === "chevron-left") return "native-chevron-candidate";
  if (shapeHint === "parallelogram-right" || shapeHint === "parallelogram-left") return "native-parallelogram-candidate";
  if (shapeHint === "cylinder") return "native-cylinder-candidate";
  if (shapeHint === "cloud") return "native-cloud-candidate";
  if (shapeHint === "document") return "native-document-candidate";
  if (shapeHint === "folder") return "native-folder-candidate";
  if (shapeHint === "screen") return "native-screen-candidate";
  if (shapeHint === "phone") return "native-phone-candidate";
  if (shapeHint === "person") return "native-person-candidate";
  if (shapeHint === "team") return "native-team-candidate";
  if (shapeHint === "gear") return "native-gear-candidate";
  if (shapeHint === "search") return "native-search-candidate";
  if (shapeHint === "shield") return "native-shield-candidate";
  if (shapeHint === "funnel") return "native-funnel-candidate";
  if (shapeHint === "cycle-arrow") return "native-cycle-arrow-candidate";
  if (shapeHint === "donut") return "native-donut-candidate";
  if (shapeHint === "scatter-point") return "native-scatter-point-candidate";
  if (component.stackedBarPart === true && aspect >= 0.7 && aspect <= 8 && areaRatio >= 0.004 && density >= 0.72 && w >= 18 && h >= 10) return "native-rect-candidate";
  if (aspect >= 2.4 && aspect <= 8 && areaRatio >= 0.012 && density >= 0.72) return "native-rect-candidate";
  if (shapeHint === "rect" && areaRatio >= 0.01 && density >= 0.55 && aspect >= 0.16 && aspect <= 8) {
    return "native-rect-candidate";
  }
  if (areaRatio >= 0.035 && density >= 0.55 && aspect >= 0.45 && aspect <= 8) {
    return "native-rect-candidate";
  }
  if (areaRatio >= 0.08 && density < 0.55) return "screenshot-crop-candidate";
  if (areaRatio <= 0.035 && aspect >= 0.45 && aspect <= 2.3) return "icon-crop-candidate";
  return "complex-shape-crop-candidate";
}

function inferShapeHint(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const density = component.pixelCount / Math.max(1, w * h);
  const areaRatio = w * h / Math.max(1, region.w * region.h);
  if (looksLikeTimeline(component, region)) return "timeline";
  if (looksLikeArrow(component, region)) return aspect >= 1 ? "arrow-horizontal" : "arrow-vertical";
  if (looksLikeSearchIcon(component) && areaRatio >= 0.008) return "search";
  if (looksLikeLine(component, region)) return "line";
  if (looksLikeDiagonalLine(component, region)) return "line-diagonal";
  const chevron = inferChevronHint(component);
  if (chevron && areaRatio >= 0.012) return chevron;
  const parallelogram = inferParallelogramHint(component);
  if (parallelogram && areaRatio >= 0.012) return parallelogram;
  if (looksLikeFolder(component) && areaRatio >= 0.012) return "folder";
  if (looksLikeShield(component) && areaRatio >= 0.01) return "shield";
  if (aspect >= 2.4 && density >= 0.62 && density <= 0.96 && areaRatio >= 0.012) return "pill";
  if (aspect >= 2.4 && density >= 0.28 && density < 0.62 && areaRatio >= 0.012) return "pill";
  if (looksLikeFunnel(component) && areaRatio >= 0.01) return "funnel";
  if (looksLikeCycleArrow(component) && areaRatio >= 0.01) return "cycle-arrow";
  if (looksLikeGear(component) && areaRatio >= 0.01) return "gear";
  if (looksLikeDonut(component) && areaRatio >= 0.01) return "donut";
  if (looksLikeScatterPoint(component, region)) return "scatter-point";
  if (looksLikeTeam(component) && areaRatio >= 0.012) return "team";
  if (looksLikePerson(component) && areaRatio >= 0.008) return "person";
  if (aspect >= 0.72 && aspect <= 1.38 && density >= 0.42 && density <= 0.62 && areaRatio >= 0.008 && looksLikeTriangle(component)) return "triangle";
  if (aspect >= 0.72 && aspect <= 1.38 && density >= 0.38 && density <= 0.58 && areaRatio >= 0.012) return "diamond";
  if (looksLikePhone(component) && areaRatio >= 0.008) return "phone";
  if (looksLikeCylinder(component) && areaRatio >= 0.012) return "cylinder";
  if (looksLikeCloud(component) && areaRatio >= 0.012) return "cloud";
  if (looksLikeDocument(component) && areaRatio >= 0.012) return "document";
  if (looksLikeScreen(component) && areaRatio >= 0.012) return "screen";
  if (aspect >= 0.72 && aspect <= 1.38 && density >= 0.58 && density <= 0.86 && areaRatio >= 0.008) return "ellipse";
  if (density >= 0.72 && aspect >= 0.16 && aspect < 0.45 && w >= Math.max(14, Number(region.w || 0) * 0.025)) return "rect";
  if (density >= 0.55 && aspect >= 0.45 && aspect <= 5.5) return "rect";
  return "complex";
}

function inferChevronHint(component) {
  const box = component.box || {};
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  if (aspect < 1.05 || aspect > 4.8 || density < 0.46 || density > 0.86) return null;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 12) return null;
  const top = averageRowBand(profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.18))));
  const middleStart = Math.floor(profile.length * 0.42);
  const middle = averageRowBand(profile.slice(middleStart, middleStart + Math.max(2, Math.ceil(profile.length * 0.16))));
  const bottom = averageRowBand(profile.slice(Math.floor(profile.length * 0.82)));
  const minShift = Number(box.w || 0) * 0.12;
  const topBottomAligned = Math.abs(top.minX - bottom.minX) <= Number(box.w || 0) * 0.08
    && Math.abs(top.maxX - bottom.maxX) <= Number(box.w || 0) * 0.08;
  if (!topBottomAligned) return null;
  if (middle.minX > top.minX + minShift && middle.maxX > top.maxX + minShift) return "chevron-right";
  if (middle.minX < top.minX - minShift && middle.maxX < top.maxX - minShift) return "chevron-left";
  return null;
}

function inferParallelogramHint(component) {
  const box = component.box || {};
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  if (aspect < 1.05 || aspect > 5.5 || density < 0.58 || density > 0.94) return null;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 12) return null;
  const top = averageRowBand(profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.2))));
  const bottom = averageRowBand(profile.slice(Math.floor(profile.length * 0.8)));
  const width = Number(box.w || 0);
  const minShift = width * 0.08;
  const leftShift = bottom.minX - top.minX;
  const rightShift = bottom.maxX - top.maxX;
  const parallelEdges = Math.abs(leftShift - rightShift) <= width * 0.08;
  if (!parallelEdges) return null;
  if (leftShift > minShift && rightShift > minShift) return "parallelogram-right";
  if (leftShift < -minShift && rightShift < -minShift) return "parallelogram-left";
  return null;
}

function averageRowBand(rows) {
  const safeRows = rows.filter(Boolean);
  const divisor = Math.max(1, safeRows.length);
  return safeRows.reduce((acc, row) => {
    acc.minX += Number(row.minX || 0) / divisor;
    acc.maxX += Number(row.maxX || 0) / divisor;
    acc.count += Number(row.count || 0) / divisor;
    return acc;
  }, { minX: 0, maxX: 0, count: 0 });
}

function looksLikeScatterPoint(component, region = {}) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const area = width * height;
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, area);
  const minSize = Math.max(5, Math.min(Number(region.w || 0), Number(region.h || 0)) * 0.012);
  const maxSize = Math.max(18, Math.min(Number(region.w || 0), Number(region.h || 0)) * 0.085);
  const areaRatio = area / regionArea;
  return width >= minSize
    && height >= minSize
    && width <= maxSize
    && height <= maxSize
    && aspect >= 0.72
    && aspect <= 1.38
    && density >= 0.58
    && density <= 0.9
    && areaRatio >= 0.00012
    && areaRatio <= 0.012;
}

function looksLikeCylinder(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.45 || aspect > 0.95 || density < 0.66 || density > 0.985) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.14));
  const top = averageRowBand(profile.slice(0, band));
  const middleStart = Math.floor(profile.length * 0.43);
  const middle = averageRowBand(profile.slice(middleStart, middleStart + band));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const capsAligned = Math.abs(top.minX - bottom.minX) <= width * 0.08
    && Math.abs(top.maxX - bottom.maxX) <= width * 0.08;
  return capsAligned
    && middleWidth >= width * 0.88
    && topWidth <= middleWidth * 0.86
    && bottomWidth <= middleWidth * 0.86;
}

function looksLikeCloud(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 2.8 || density < 0.48 || density > 0.86) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 14) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.13));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.22), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.45), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.66), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const maxInteriorWidth = Math.max(upperWidth, middleWidth, lowerWidth);
  const lobedTop = topWidth <= maxInteriorWidth * 0.72 && upperWidth >= maxInteriorWidth * 0.68;
  const roundedBottom = bottomWidth <= maxInteriorWidth * 0.82 && lowerWidth >= maxInteriorWidth * 0.78;
  const sideBulges = Math.abs(upper.minX - lower.minX) >= width * 0.04 || Math.abs(upper.maxX - lower.maxX) >= width * 0.04;
  return lobedTop && roundedBottom && sideBulges;
}

function looksLikeDocument(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 3.5 || density < 0.78 || density > 0.985) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 16) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.42), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.76), Math.floor(profile.length * 0.88)));
  const bottomRows = profile.slice(profile.length - Math.max(5, Math.ceil(profile.length * 0.18)));
  const topWidth = top.maxX - top.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomCounts = bottomRows.map((row) => Number(row.count || 0));
  const minBottom = Math.min(...bottomCounts);
  const maxBottom = Math.max(...bottomCounts);
  const bottomVariance = maxBottom - minBottom;
  const straightBody = topWidth >= width * 0.9 && middleWidth >= width * 0.92 && lowerWidth >= width * 0.84;
  const wavyBottom = minBottom <= middleWidth * 0.74 && maxBottom >= middleWidth * 0.88 && bottomVariance >= width * 0.14;
  const sidesAligned = Math.abs(top.minX - middle.minX) <= width * 0.06 && Math.abs(top.maxX - middle.maxX) <= width * 0.06;
  return straightBody && wavyBottom && sidesAligned;
}

function looksLikeFolder(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.35 || aspect > 5.2 || density < 0.62 || density > 0.96) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 16) return false;
  const topBand = profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.16)));
  const shoulderStart = Math.floor(profile.length * 0.24);
  const shoulderBand = profile.slice(shoulderStart, shoulderStart + Math.max(2, Math.ceil(profile.length * 0.12)));
  const middleStart = Math.floor(profile.length * 0.45);
  const middleBand = profile.slice(middleStart, middleStart + Math.max(2, Math.ceil(profile.length * 0.18)));
  const top = averageRowBand(topBand);
  const shoulder = averageRowBand(shoulderBand);
  const middle = averageRowBand(middleBand);
  const left = Number(box.x || 0);
  const right = left + width;
  const topWidth = top.maxX - top.minX + 1;
  const shoulderWidth = shoulder.maxX - shoulder.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  if (middleWidth < width * 0.72 || shoulderWidth < width * 0.72) return false;
  if (topWidth >= middleWidth * 0.82 || topWidth <= width * 0.18) return false;
  const tabStartsNearLeft = Math.abs(top.minX - left) <= width * 0.12;
  const tabEndsBeforeRight = top.maxX <= right - width * 0.18;
  const bodyStartsNearLeft = Math.abs(middle.minX - left) <= width * 0.12;
  const bodyEndsNearRight = Math.abs(middle.maxX - right) <= width * 0.12;
  return tabStartsNearLeft && tabEndsBeforeRight && bodyStartsNearLeft && bodyEndsNearRight;
}

function looksLikeScreen(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 2.4 || density < 0.58 || density > 0.9) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.34), Math.floor(profile.length * 0.54)));
  const neck = averageRowBand(profile.slice(Math.floor(profile.length * 0.72), Math.floor(profile.length * 0.84)));
  const base = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const neckWidth = neck.maxX - neck.minX + 1;
  const baseWidth = base.maxX - base.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const neckCenter = (neck.minX + neck.maxX) / 2;
  const baseCenter = (base.minX + base.maxX) / 2;
  const widePanel = topWidth >= width * 0.88 && middleWidth >= width * 0.9;
  const centeredStand = neckWidth <= middleWidth * 0.35
    && baseWidth >= middleWidth * 0.35
    && baseWidth <= middleWidth * 0.72
    && Math.abs(neckCenter - center) <= width * 0.08
    && Math.abs(baseCenter - center) <= width * 0.08;
  return widePanel && centeredStand;
}

function looksLikePhone(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.36 || aspect > 0.66 || density < 0.72 || density > 0.995) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.34)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.66), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const straightBody = upperWidth >= width * 0.9
    && middleWidth >= width * 0.92
    && lowerWidth >= width * 0.9
    && Math.abs(upper.minX - lower.minX) <= width * 0.06
    && Math.abs(upper.maxX - lower.maxX) <= width * 0.06;
  const roundedEnds = topWidth >= middleWidth * 0.46
    && topWidth <= middleWidth * 0.96
    && bottomWidth >= middleWidth * 0.46
    && bottomWidth <= middleWidth * 0.96;
  return straightBody && roundedEnds;
}

function looksLikePerson(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.38 || aspect > 0.92 || density < 0.38 || density > 0.93) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const head = averageRowBand(profile.slice(Math.floor(profile.length * 0.18), Math.floor(profile.length * 0.34)));
  const neck = averageRowBand(profile.slice(Math.floor(profile.length * 0.36), Math.floor(profile.length * 0.48)));
  const torso = averageRowBand(profile.slice(Math.floor(profile.length * 0.58), Math.floor(profile.length * 0.78)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const headWidth = head.maxX - head.minX + 1;
  const neckWidth = neck.maxX - neck.minX + 1;
  const torsoWidth = torso.maxX - torso.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const headCenter = (head.minX + head.maxX) / 2;
  const torsoCenter = (torso.minX + torso.maxX) / 2;
  const roundedHead = headWidth >= width * 0.42
    && headWidth <= width * 0.88
    && topWidth <= headWidth * 0.86;
  const broaderTorso = torsoWidth >= headWidth * 1.12
    && torsoWidth >= width * 0.68
    && bottomWidth >= torsoWidth * 0.72;
  const centeredParts = Math.abs(headCenter - center) <= width * 0.12
    && Math.abs(torsoCenter - center) <= width * 0.1;
  const neckTransition = neckWidth <= torsoWidth * 1.02
    && neckWidth >= headWidth * 0.46;
  return roundedHead && broaderTorso && centeredParts && neckTransition;
}

function looksLikeTeam(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 2.15 || density < 0.38 || density > 0.9) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const heads = averageRowBand(profile.slice(Math.floor(profile.length * 0.18), Math.floor(profile.length * 0.34)));
  const neck = averageRowBand(profile.slice(Math.floor(profile.length * 0.36), Math.floor(profile.length * 0.5)));
  const torso = averageRowBand(profile.slice(Math.floor(profile.length * 0.58), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const headsWidth = heads.maxX - heads.minX + 1;
  const neckWidth = neck.maxX - neck.minX + 1;
  const torsoWidth = torso.maxX - torso.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const headsCenter = (heads.minX + heads.maxX) / 2;
  const torsoCenter = (torso.minX + torso.maxX) / 2;
  const multipleHeads = headsWidth >= width * 0.58
    && headsWidth <= width * 0.95
    && topWidth >= headsWidth * 0.15
    && topWidth <= headsWidth * 0.82;
  const sharedTorso = torsoWidth >= headsWidth * 0.95
    && torsoWidth >= width * 0.72
    && bottomWidth >= torsoWidth * 0.74;
  const centeredGroup = Math.abs(headsCenter - center) <= width * 0.08
    && Math.abs(torsoCenter - center) <= width * 0.08;
  const neckTransition = neckWidth >= headsWidth * 0.7
    && neckWidth <= torsoWidth * 1.04;
  return multipleHeads && sharedTorso && centeredGroup && neckTransition;
}

function looksLikeFunnel(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.65 || aspect > 1.85 || density < 0.34 || density > 0.72) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 20) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.34)));
  const waist = averageRowBand(profile.slice(Math.floor(profile.length * 0.48), Math.floor(profile.length * 0.6)));
  const stem = averageRowBand(profile.slice(Math.floor(profile.length * 0.72), Math.floor(profile.length * 0.9)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const waistWidth = waist.maxX - waist.minX + 1;
  const stemWidth = stem.maxX - stem.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const stemCenter = (stem.minX + stem.maxX) / 2;
  const bottomCenter = (bottom.minX + bottom.maxX) / 2;
  const taperedBowl = topWidth >= width * 0.82
    && upperWidth <= topWidth * 0.9
    && waistWidth <= topWidth * 0.58
    && waistWidth >= topWidth * 0.22;
  const centeredStem = stemWidth <= topWidth * 0.34
    && bottomWidth <= topWidth * 0.34
    && stemWidth >= topWidth * 0.12
    && Math.abs(stemCenter - center) <= width * 0.08
    && Math.abs(bottomCenter - center) <= width * 0.08;
  return taperedBowl && centeredStem;
}

function looksLikeDonut(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.72 || aspect > 1.38 || density < 0.28 || density > 0.64) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.22), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.56)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.64), Math.floor(profile.length * 0.78)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const roundedOuterProfile = middleWidth >= width * 0.82
    && upperWidth >= middleWidth * 0.72
    && lowerWidth >= middleWidth * 0.72
    && topWidth >= middleWidth * 0.18
    && topWidth <= middleWidth * 0.72
    && bottomWidth >= middleWidth * 0.18
    && bottomWidth <= middleWidth * 0.72;
  const topBottomSymmetry = Math.abs(topWidth - bottomWidth) <= middleWidth * 0.18
    && Math.abs(upperWidth - lowerWidth) <= middleWidth * 0.16;
  return roundedOuterProfile && topBottomSymmetry;
}

function looksLikeGear(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (width < 28 || height < 28 || aspect < 0.72 || aspect > 1.38) return false;
  if (density < 0.24 || density > 0.72) return false;
  if (!looksLikeDonut(component)) return false;
  const rowRoughness = profileEdgeRoughness(component.rowProfile || [], width);
  const colRoughness = profileEdgeRoughness(component.colProfile || [], height, "col");
  const rowProtrusion = profileOuterProtrusionRatio(component.rowProfile || [], width);
  const colProtrusion = profileOuterProtrusionRatio(component.colProfile || [], height, "col");
  return Math.max(rowRoughness, colRoughness) >= 0.01
    && Math.min(rowProtrusion, colProtrusion) >= 0.19;
}

function looksLikeSearchIcon(component) {
  return searchIconEvidence(component).matched;
}

function searchIconEvidence(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (width < 26 || height < 26 || aspect < 0.72 || aspect > 1.65) return { matched: false, reason: "bounds", width, height, aspect, density };
  if (density < 0.16 || density > 0.58) return { matched: false, reason: "density", width, height, aspect, density };
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return { matched: false, reason: "profile", width, height, aspect, density, profileLength: profile.length };
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.56)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.64), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const middleInkRatio = middle.count / Math.max(1, middleWidth);
  const middleCenter = (middle.minX + middle.maxX) / 2;
  const lowerCenter = (lower.minX + lower.maxX) / 2;
  const bottomCenter = (bottom.minX + bottom.maxX) / 2;
  const completeLensLike = upperWidth >= width * 0.42
    && middleWidth >= width * 0.48
    && topWidth >= width * 0.10
    && topWidth <= middleWidth * 0.72
    && middleInkRatio <= 0.82;
  // Text or output cards frequently occlude the right half of a magnifier.
  // Preserve the ring-plus-handle interpretation when the upper arc remains
  // broad and the visible middle fragment sits well left of the handle.
  const occludedLensLike = topWidth >= width * 0.22
    && upperWidth >= width * 0.38
    && middleWidth >= width * 0.12
    && middleWidth <= upperWidth * 0.62
    && lowerWidth >= width * 0.22
    && middleCenter <= lowerCenter - width * 0.25
    && upperWidth >= topWidth * 0.95;
  const lensLike = completeLensLike || occludedLensLike;
  const handleLike = bottomWidth >= width * 0.08
    && bottomWidth <= width * 0.48
    && lowerWidth <= Math.max(middleWidth * 0.9, bottomWidth * 2.8)
    && lowerCenter >= middleCenter + width * 0.08
    && bottomCenter >= middleCenter + width * 0.16
    && bottom.minX >= Number(box.x || 0) + width * 0.42
    && bottom.maxX >= Number(box.x || 0) + width * 0.72;
  return {
    matched: lensLike && handleLike,
    reason: lensLike ? (handleLike ? "matched" : "handle") : "lens",
    width,
    height,
    aspect,
    density,
    topWidth,
    upperWidth,
    middleWidth,
    lowerWidth,
    bottomWidth,
    middleInkRatio,
    middleCenter,
    lowerCenter,
    bottomCenter,
    bottomMinX: bottom.minX,
    bottomMaxX: bottom.maxX,
    lensLike,
    completeLensLike,
    occludedLensLike,
    handleLike
  };
}

function looksLikeShield(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (width < 28 || height < 34 || aspect < 0.58 || aspect > 1.28) return false;
  if (density < 0.42 || density > 0.86) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.10));
  const top = averageRowBand(profile.slice(0, band));
  const shoulder = averageRowBand(profile.slice(Math.floor(profile.length * 0.16), Math.floor(profile.length * 0.30)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.42), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.68), Math.floor(profile.length * 0.82)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const shoulderWidth = shoulder.maxX - shoulder.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const centers = [top, shoulder, middle, lower, bottom].map((item) => (item.minX + item.maxX) / 2);
  const centered = centers.every((value) => Math.abs(value - center) <= width * 0.12);
  const broadTop = shoulderWidth >= width * 0.78
    && topWidth >= width * 0.28
    && topWidth <= shoulderWidth * 1.05;
  const shieldTaper = middleWidth >= shoulderWidth * 0.70
    && middleWidth <= shoulderWidth * 1.02
    && lowerWidth <= middleWidth * 0.72
    && lowerWidth >= shoulderWidth * 0.28
    && bottomWidth <= shoulderWidth * 0.34;
  const pointedBottom = bottom.count / Math.max(1, bottomWidth) >= 0.72
    && bottomWidth <= width * 0.34;
  return centered && broadTop && shieldTaper && pointedBottom;
}

function profileEdgeRoughness(profile = [], span, axis = "row") {
  if (!Array.isArray(profile) || profile.length < 18 || !span) return 0;
  const widths = profile.map((item) => axis === "col"
    ? Number(item.maxY || 0) - Number(item.minY || 0) + 1
    : Number(item.maxX || 0) - Number(item.minX || 0) + 1);
  let total = 0;
  let count = 0;
  for (let index = 2; index < widths.length - 2; index += 1) {
    const localAverage = (widths[index - 2] + widths[index - 1] + widths[index + 1] + widths[index + 2]) / 4;
    total += Math.abs(widths[index] - localAverage) / Math.max(1, span);
    count += 1;
  }
  return total / Math.max(1, count);
}

function profileOuterProtrusionRatio(profile = [], span, axis = "row") {
  if (!Array.isArray(profile) || profile.length < 18 || !span) return 0;
  const widths = profile.map((item) => axis === "col"
    ? Number(item.maxY || 0) - Number(item.minY || 0) + 1
    : Number(item.maxX || 0) - Number(item.minX || 0) + 1);
  const maxWidth = Math.max(...widths);
  const band = Math.max(2, Math.ceil(widths.length * 0.08));
  const edgeWidth = Math.max(
    average(widths.slice(0, band)),
    average(widths.slice(widths.length - band))
  );
  return edgeWidth / Math.max(1, maxWidth);
}

function looksLikeCycleArrow(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.72 || aspect > 1.38 || density < 0.18 || density > 0.58) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.56)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.64), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const outerWidth = Math.max(topWidth, upperWidth, middleWidth, lowerWidth, bottomWidth);
  if (outerWidth < width * 0.72) return false;
  const middleInkRatio = middle.count / Math.max(1, middleWidth);
  const upperInkRatio = upper.count / Math.max(1, upperWidth);
  const lowerInkRatio = lower.count / Math.max(1, lowerWidth);
  const hasOpenCenter = Math.min(upperInkRatio, lowerInkRatio) <= 0.68
    || (middleWidth <= outerWidth * 0.58 && middleInkRatio <= 0.9);
  if (!hasOpenCenter) return false;
  const roundedBand = upperWidth >= outerWidth * 0.56
    && lowerWidth >= outerWidth * 0.56
    && topWidth >= outerWidth * 0.12
    && bottomWidth >= outerWidth * 0.12;
  if (!roundedBand) return false;
  const center = (bandStats) => (bandStats.minX + bandStats.maxX) / 2;
  const widthAsymmetry = Math.max(
    Math.abs(topWidth - bottomWidth),
    Math.abs(upperWidth - lowerWidth)
  );
  const centerAsymmetry = Math.max(
    Math.abs(center(top) - center(bottom)),
    Math.abs(center(upper) - center(lower))
  );
  return widthAsymmetry >= outerWidth * 0.16 || centerAsymmetry >= width * 0.07;
}

function looksLikeTriangle(component) {
  const box = component.box || {};
  const expected = Number(box.w || 0) * Number(box.h || 0) / 2;
  if (expected <= 0) return false;
  const ratio = Number(component.pixelCount || 0) / expected;
  if (ratio < 0.72 || ratio > 1.28) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 8) return false;
  const maxCount = Math.max(...profile.map((row) => row.count));
  const maxIndex = profile.findIndex((row) => row.count === maxCount);
  const edgeBand = Math.max(2, Math.ceil(profile.length * 0.22));
  return maxIndex < edgeBand || maxIndex >= profile.length - edgeBand;
}

function looksLikeLine(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  return (aspect >= 7 && h <= Math.max(10, region.h * 0.08))
    || (aspect <= 0.14 && w <= Math.max(10, region.w * 0.08));
}

function looksLikeDiagonalLine(component, region) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  if (width < Math.max(28, Number(region.w || 0) * 0.045) || height < Math.max(18, Number(region.h || 0) * 0.04)) return false;
  const aspect = width / Math.max(1, height);
  // Shallow connectors can legitimately span more than four widths per
  // height. Linear-fit evidence below still rejects ordinary long boxes.
  if (aspect < 0.16 || aspect > 6.5) return false;
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (density < 0.012 || density > 0.34) return false;
  const fit = inferDiagonalLineFit(component);
  return fit && fit.coverage >= 0.58 && fit.monotonicity >= 0.72 && fit.errorRatio <= 0.16;
}

function inferDiagonalLineFit(component) {
  const box = component.box || {};
  const rows = (component.rowProfile || [])
    .filter((row) => Number(row.count || 0) > 0)
    .map((row) => ({
      y: Number(row.y || 0),
      x: (Number(row.minX || 0) + Number(row.maxX || 0)) / 2
    }))
    .sort((a, b) => a.y - b.y);
  if (rows.length < Math.max(8, Number(box.h || 0) * 0.35)) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const dy = last.y - first.y;
  if (Math.abs(dy) < 4) return null;
  const slope = (last.x - first.x) / dy;
  let totalError = 0;
  let monotonicSteps = 0;
  const direction = Math.sign(last.x - first.x) || 1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expected = first.x + slope * (row.y - first.y);
    totalError += Math.abs(row.x - expected);
    if (index === 0 || (rows[index].x - rows[index - 1].x) * direction >= -1.5) monotonicSteps += 1;
  }
  const coverage = rows.length / Math.max(1, Number(box.h || 0));
  const monotonicity = monotonicSteps / Math.max(1, rows.length);
  const errorRatio = totalError / Math.max(1, rows.length * Math.max(1, Number(box.w || 0)));
  return { coverage, monotonicity, errorRatio, first, last };
}

function inferDiagonalLineEndpoints(component) {
  const fit = inferDiagonalLineFit(component);
  if (!fit) return null;
  return {
    from: { x: round(fit.first.x), y: round(fit.first.y) },
    to: { x: round(fit.last.x), y: round(fit.last.y) }
  };
}

function looksLikeTimeline(component, region) {
  const { w, h } = component.box || {};
  const aspect = Number(w || 0) / Math.max(1, Number(h || 0));
  const density = Number(component.pixelCount || 0) / Math.max(1, Number(w || 0) * Number(h || 0));
  if (aspect < 4.2 || Number(h || 0) > Math.max(34, Number(region.h || 0) * 0.18)) return false;
  if (density < 0.16 || density > 0.68) return false;
  const rows = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  const cols = Array.isArray(component.colProfile) ? component.colProfile : [];
  if (rows.length < 5 || cols.length < 40) return false;
  const maxRowCount = Math.max(...rows.map((row) => Number(row.count || 0)));
  const rowSpan = Math.max(...rows.map((row) => Number(row.maxX || 0))) - Math.min(...rows.map((row) => Number(row.minX || 0))) + 1;
  const hasMainAxis = maxRowCount >= rowSpan * 0.72;
  return hasMainAxis && inferTimelineMilestones(component).length >= 3;
}

function inferTimelineMilestones(component, image = null, slideSize = DEFAULT_SLIDE) {
  const cols = Array.isArray(component.colProfile) ? component.colProfile : [];
  const box = component.box || {};
  if (cols.length === 0) return [];
  const counts = cols.map((col) => Number(col.count || 0)).sort((a, b) => a - b);
  const baseline = counts[Math.floor(counts.length * 0.35)] || 1;
  const minPeak = Math.max(baseline * 1.8, Number(box.h || 0) * 0.34, 5);
  const groups = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const minX = Math.min(...group.map((col) => Number(col.x || 0)));
    const maxX = Math.max(...group.map((col) => Number(col.x || 0)));
    const maxCount = Math.max(...group.map((col) => Number(col.count || 0)));
    if (maxX - minX + 1 >= Math.max(4, Number(box.h || 0) * 0.18)) {
      const centerPx = (minX + maxX + 1) / 2;
      const x = image ? round(centerPx * Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width) : centerPx;
      const widthPx = maxX - minX + 1;
      const widthPt = image ? round(widthPx * Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width) : widthPx;
      groups.push({ x, widthPx, widthPt, strength: round(maxCount / Math.max(1, Number(box.h || 0))) });
    }
    group = [];
  };
  for (const col of cols) {
    if (Number(col.count || 0) >= minPeak) {
      if (!group.length || Number(col.x || 0) <= Number(group[group.length - 1].x || 0) + 2) group.push(col);
      else {
        flush();
        group.push(col);
      }
    } else {
      flush();
    }
  }
  flush();
  return groups
    .filter((group, index, all) => !all.some((other, otherIndex) =>
      otherIndex !== index && Math.abs(other.x - group.x) < 4 && other.widthPx > group.widthPx
    ))
    .slice(0, 12);
}

function looksLikeArrow(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const density = component.pixelCount / Math.max(1, w * h);
  if (density >= 0.72) return false;
  if (aspect >= 3.2 && h <= Math.max(28, region.h * 0.16)) {
    return arrowProfileEvidence(component.colProfile, "vertical-span");
  }
  if (aspect <= 0.31 && w <= Math.max(28, region.w * 0.16)) {
    return arrowProfileEvidence(component.rowProfile, "horizontal-span");
  }
  return false;
}

function inferArrowDirection(component = {}) {
  const horizontal = Number(component.box?.w || 0) >= Number(component.box?.h || 0);
  const profile = horizontal ? component.colProfile : component.rowProfile;
  const spans = profileSpans(profile, horizontal ? "vertical-span" : "horizontal-span");
  if (spans.length < 5) return horizontal ? "right" : "down";
  const windowSize = Math.max(2, Math.floor(spans.length * 0.2));
  const start = Math.max(...spans.slice(0, windowSize));
  const end = Math.max(...spans.slice(-windowSize));
  if (horizontal) return start > end * 1.12 ? "left" : "right";
  return start > end * 1.12 ? "up" : "down";
}

function arrowProfileEvidence(profile = [], spanKind) {
  const spans = profileSpans(profile, spanKind);
  if (spans.length < 8) return false;
  const windowSize = Math.max(2, Math.floor(spans.length * 0.2));
  const middleStart = windowSize;
  const middleEnd = Math.max(middleStart + 1, spans.length - windowSize);
  const shaftSpan = median(spans.slice(middleStart, middleEnd));
  const startSpan = Math.max(...spans.slice(0, windowSize));
  const endSpan = Math.max(...spans.slice(-windowSize));
  const headSpan = Math.max(startSpan, endSpan);
  const tailSpan = Math.min(startSpan, endSpan);
  return shaftSpan >= 1
    && headSpan >= Math.max(shaftSpan * 1.45, shaftSpan + 3)
    && headSpan >= tailSpan * 1.18;
}

function profileSpans(profile = [], spanKind) {
  return (profile || []).map((entry) => spanKind === "vertical-span"
    ? Math.max(1, Number(entry.maxY || 0) - Number(entry.minY || 0) + 1)
    : Math.max(1, Number(entry.maxX || 0) - Number(entry.minX || 0) + 1));
}

function isGridLikeLine(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const longAxisRatio = aspect >= 1 ? w / Math.max(1, region.w) : h / Math.max(1, region.h);
  return longAxisRatio >= 0.72;
}

module.exports = {
  dedupeComponentPriority,
  isUsefulAtom,
  classifyAtom,
  inferShapeHint,
  inferChevronHint,
  inferParallelogramHint,
  averageRowBand,
  looksLikeScatterPoint,
  looksLikeCylinder,
  looksLikeCloud,
  looksLikeDocument,
  looksLikeFolder,
  looksLikeScreen,
  looksLikePhone,
  looksLikePerson,
  looksLikeTeam,
  looksLikeFunnel,
  looksLikeDonut,
  looksLikeGear,
  looksLikeSearchIcon,
  searchIconEvidence,
  looksLikeShield,
  profileEdgeRoughness,
  profileOuterProtrusionRatio,
  looksLikeCycleArrow,
  looksLikeTriangle,
  looksLikeLine,
  looksLikeDiagonalLine,
  inferDiagonalLineFit,
  inferDiagonalLineEndpoints,
  looksLikeTimeline,
  inferTimelineMilestones,
  looksLikeArrow,
  inferArrowDirection,
  arrowProfileEvidence,
  profileSpans,
  isGridLikeLine
};
