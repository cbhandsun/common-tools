"use strict";
const { clamp, luma, saturation, pixel } = require("./raster-native-detection");

function boxesNear(a, b, distance) {
  return !(a.x + a.w + distance < b.x
    || b.x + b.w + distance < a.x
    || a.y + a.h + distance < b.y
    || b.y + b.h + distance < a.y);
}

function residualSplitComponents(residual) {
  return mergeGraphicComponents([...foregroundComponents(residual, []), ...paleStructureComponents(residual)], residual)
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      if (areaRatio < 0.004 || areaRatio > 0.36) return false;
      if (component.box.w < 28 || component.box.h < 24) return false;
      if (component.box.w > residual.width * 0.82 && component.box.h > residual.height * 0.65) return false;
      return true;
    })
    .slice(0, 10);
}

function tableGridAwareResidualSplitDecision(components, residual) {
  if (!Array.isArray(components) || components.length < 2) {
    return { use: false, reason: "too-few-table-grid-components", componentCount: Array.isArray(components) ? components.length : 0 };
  }
  if (components.length > 8) return { use: false, reason: "too-many-table-grid-components", componentCount: components.length };
  const base = residualSplitDecision(components, residual, { maxComponents: 8, maxArea: 0.58, maxUnionArea: 1.01 });
  return base.use ? { ...base, reason: "accepted" } : { ...base, reason: `table-grid-${base.reason}` };
}

function tableGridAwareResidualComponents(image, residual, components = []) {
  const grid = image?.source?.objectifiedGrid || {};
  const localXLines = slideGridLinesToLocalPx(grid.xLines, image.box, residual, "x");
  const localYLines = slideGridLinesToLocalPx(grid.yLines, image.box, residual, "y");
  if (localXLines.length < 3 || localYLines.length < 3) return [];
  const byCell = new Map();
  for (const component of components || []) {
    const centerX = Number(component.box?.x || 0) + Number(component.box?.w || 0) / 2;
    const centerY = Number(component.box?.y || 0) + Number(component.box?.h || 0) / 2;
    const column = lineIntervalIndex(localXLines, centerX);
    const row = lineIntervalIndex(localYLines, centerY);
    if (column < 0 || row < 0) continue;
    const key = `${row}:${column}`;
    const existing = byCell.get(key);
    byCell.set(key, existing ? {
      ...existing,
      box: expandPxBox(unionBox(existing.box, component.box), residual, 6),
      children: existing.children + 1
    } : {
      box: expandPxBox(component.box, residual, 6),
      children: 1,
      row,
      column,
      splitMode: "table-grid-cell"
    });
  }
  const cellComponents = filterTableGridResidualComponents([...byCell.values()], residual);
  const candidates = [
    cellComponents,
    filterTableGridResidualComponents(tableGridAxisGroupedResidualComponents(cellComponents, residual, "column"), residual),
    filterTableGridResidualComponents(tableGridAxisGroupedResidualComponents(cellComponents, residual, "row"), residual)
  ].filter((candidate) => candidate.length > 0);
  const accepted = candidates
    .map((candidate) => ({ candidate, decision: tableGridAwareResidualSplitDecision(candidate, residual) }))
    .filter((item) => item.decision.use);
  if (accepted.length > 0) {
    accepted.sort((left, right) => tableGridResidualCandidateScore(left.decision) - tableGridResidualCandidateScore(right.decision));
    return accepted[0].candidate;
  }
  candidates.sort((left, right) => left.length - right.length);
  return (candidates[0] || []).slice(0, 8);
}

function tableGridAxisGroupedResidualComponents(components = [], residual, axis = "column") {
  const keyField = axis === "row" ? "row" : "column";
  const groups = new Map();
  for (const component of components) {
    const key = String(component[keyField] ?? "unknown");
    const existing = groups.get(key);
    groups.set(key, existing ? {
      ...existing,
      box: expandPxBox(unionBox(existing.box, component.box), residual, 8),
      children: existing.children + Number(component.children || 1)
    } : {
      ...component,
      splitMode: `table-grid-${axis}`
    });
  }
  return [...groups.values()];
}

function filterTableGridResidualComponents(components = [], residual) {
  return (components || []).filter((component) => {
    const areaRatio = Number(component.box?.w || 0) * Number(component.box?.h || 0) / Math.max(1, residual.width * residual.height);
    return areaRatio >= 0.003 && areaRatio <= 0.58 && Number(component.box?.w || 0) >= 18 && Number(component.box?.h || 0) >= 18;
  });
}

function tableGridResidualCandidateScore(decision = {}) {
  return Number(decision.maxArea || 0) * 3
    + Number(decision.unionArea || 0)
    + Number(decision.totalArea || 0) * 0.5
    + Number(decision.componentCount || 0) * 0.02;
}

function slideGridLinesToLocalPx(lines = [], imageBox = {}, residual, axis = "x") {
  const origin = Number(axis === "x" ? imageBox.x : imageBox.y);
  const size = Number(axis === "x" ? imageBox.w : imageBox.h);
  const pxSize = Number(axis === "x" ? residual.width : residual.height);
  if (!Number.isFinite(origin) || !Number.isFinite(size) || size <= 0 || !Number.isFinite(pxSize) || pxSize <= 0) return [];
  return uniqueSortedLinePositions((lines || []).map((line) => ((Number(line) - origin) / size) * pxSize), Math.max(2, pxSize * 0.006))
    .map((value) => clamp(Math.round(value), 0, pxSize));
}

function lineIntervalIndex(lines = [], value) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (value >= lines[index] && value <= lines[index + 1]) return index;
  }
  return -1;
}

function wideResidualBandComponents(residual) {
  const denseRuns = significantVerticalInkRuns(residual);
  if (denseRuns.length < 2 || denseRuns.length > 6) return [];
  const cuts = [];
  for (let index = 0; index < denseRuns.length - 1; index += 1) {
    const left = denseRuns[index];
    const right = denseRuns[index + 1];
    const gap = right.start - left.end;
    if (gap < residual.width * 0.035) return [];
    cuts.push(Math.round((left.end + right.start) / 2));
  }
  const components = [];
  let start = 0;
  for (let index = 0; index <= cuts.length; index += 1) {
    const end = index < cuts.length ? cuts[index] : residual.width - 1;
    const box = trimResidualBandBox(residual, { x: start, y: 0, w: Math.max(1, end - start + 1), h: residual.height });
    if (box) {
      components.push({
        box,
        sampledCount: Math.max(1, box.w * box.h),
        splitMode: "wide-band"
      });
    }
    start = end + 1;
  }
  return components.filter((component) => {
    const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
    return areaRatio >= 0.035 && areaRatio <= 0.42 && component.box.w >= 40 && component.box.h >= 40;
  });
}

function continuousWideResidualComponents(residual) {
  const bounds = trimResidualBandBox(residual, { x: 0, y: 0, w: residual.width, h: residual.height });
  if (!bounds) return [];
  const cut1 = clamp(Math.round(bounds.x + bounds.w * 0.34), bounds.x + 40, bounds.x + bounds.w - 80);
  const cut2 = clamp(Math.round(bounds.x + bounds.w * 0.68), cut1 + 40, bounds.x + bounds.w - 40);
  const bands = [
    { x: bounds.x, y: 0, w: cut1 - bounds.x + 1, h: residual.height },
    { x: cut1, y: 0, w: cut2 - cut1 + 1, h: residual.height },
    { x: cut2, y: 0, w: bounds.x + bounds.w - cut2, h: residual.height }
  ];
  return bands
    .map((band) => trimResidualBandBox(residual, band))
    .filter(Boolean)
    .map((box) => ({
      box,
      sampledCount: Math.max(1, box.w * box.h),
      splitMode: "continuous-wide-band"
    }))
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      return areaRatio >= 0.035 && areaRatio <= 0.44 && component.box.w >= 40 && component.box.h >= 40;
    });
}

function significantVerticalInkRuns(residual) {
  const densities = [];
  for (let x = 0; x < residual.width; x += 1) {
    let count = 0;
    let total = 0;
    for (let y = 0; y < residual.height; y += 3) {
      total += 1;
      if (isBandSignificantPixel(pixel(residual, x, y))) count += 1;
    }
    densities.push(count / Math.max(1, total));
  }
  const smoothed = densities.map((value, index) => {
    let sum = 0;
    let count = 0;
    for (let dx = -6; dx <= 6; dx += 1) {
      const at = index + dx;
      if (at < 0 || at >= densities.length) continue;
      sum += densities[at];
      count += 1;
    }
    return sum / Math.max(1, count);
  });
  const runs = [];
  let start = null;
  const threshold = 0.12;
  for (let x = 0; x < smoothed.length; x += 1) {
    if (smoothed[x] >= threshold) {
      if (start === null) start = x;
    } else if (start !== null) {
      runs.push({ start, end: x - 1 });
      start = null;
    }
  }
  if (start !== null) runs.push({ start, end: smoothed.length - 1 });
  const minWidth = Math.max(28, Math.round(residual.width * 0.035));
  return mergeNearbyRuns(runs.filter((run) => run.end - run.start + 1 >= minWidth), residual.width * 0.025);
}

function mergeNearbyRuns(runs, maxGap) {
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.start - last.end <= maxGap) {
      last.end = run.end;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function trimResidualBandBox(residual, band) {
  let minX = band.x + band.w;
  let minY = residual.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < residual.height; y += 2) {
    for (let x = band.x; x < band.x + band.w && x < residual.width; x += 2) {
      if (!isGraphicForeground(pixel(residual, x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const horizontalPad = Math.max(10, Math.round(residual.width * 0.01));
  return expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, residual, horizontalPad);
}

function isBandSignificantPixel(color) {
  if (color.a < 64) return false;
  const lightness = luma(color);
  if (lightness > 246 && saturation(color) < 0.12) return false;
  if (lightness > 232 && saturation(color) < 0.06) return false;
  return true;
}

function wideResidualBandSplitDecision(components, residual) {
  if (!Array.isArray(components) || components.length < 2) {
    return { use: false, reason: "too-few-band-components", componentCount: Array.isArray(components) ? components.length : 0 };
  }
  if (components.length > 6) return { use: false, reason: "too-many-band-components", componentCount: components.length };
  const fullArea = Math.max(1, residual.width * residual.height);
  const totalArea = components.reduce((sum, component) => sum + component.box.w * component.box.h, 0) / fullArea;
  const maxArea = Math.max(...components.map((component) => component.box.w * component.box.h / fullArea));
  const union = components.map((component) => component.box).reduce((acc, box) => unionBox(acc, box));
  const unionArea = union.w * union.h / fullArea;
  if (totalArea < 0.16) return { use: false, reason: "band-area-too-low", componentCount: components.length, totalArea, maxArea, unionArea };
  if (totalArea > 0.97) return { use: false, reason: "band-area-too-high", componentCount: components.length, totalArea, maxArea, unionArea };
  if (maxArea > 0.44) return { use: false, reason: "band-component-too-large", componentCount: components.length, totalArea, maxArea, unionArea };
  return { use: true, reason: "accepted", componentCount: components.length, totalArea, maxArea, unionArea };
}

function residualSplitDecision(components, residual, options = {}) {
  const minComponents = options.allowSingleComponent ? 1 : 2;
  const maxComponents = Number(options.maxComponents ?? 8);
  if (!Array.isArray(components) || components.length < minComponents) {
    return { use: false, reason: "too-few-components", componentCount: Array.isArray(components) ? components.length : 0 };
  }
  if (components.length > maxComponents) return { use: false, reason: "too-many-components", componentCount: components.length };
  const fullArea = Math.max(1, residual.width * residual.height);
  const totalArea = components.reduce((sum, component) => sum + component.box.w * component.box.h, 0) / fullArea;
  const maxArea = Math.max(...components.map((component) => component.box.w * component.box.h / fullArea));
  const paleRatio = uncoveredPaleStructureRatio(residual, components);
  const maxUncoveredPaleStructureRatio = Number(options.maxUncoveredPaleStructureRatio ?? 0.025);
  if (totalArea < 0.03) return { use: false, reason: "component-area-too-low", componentCount: components.length, totalArea, maxArea, uncoveredPaleStructureRatio: paleRatio };
  if (totalArea < 0.1 && paleRatio > 0.01) return { use: false, reason: "component-area-too-low", componentCount: components.length, totalArea, maxArea, uncoveredPaleStructureRatio: paleRatio };
  if (totalArea > 0.72) return { use: false, reason: "component-area-too-high", componentCount: components.length, totalArea, maxArea };
  if (maxArea > Number(options.maxArea ?? 0.42)) return { use: false, reason: "component-too-large", componentCount: components.length, totalArea, maxArea };
  if (paleRatio > maxUncoveredPaleStructureRatio) return { use: false, reason: "uncovered-pale-structure", componentCount: components.length, totalArea, maxArea, uncoveredPaleStructureRatio: paleRatio };
  const union = components.map((component) => component.box).reduce((acc, box) => unionBox(acc, box));
  const unionArea = union.w * union.h / fullArea;
  if (unionArea > Number(options.maxUnionArea ?? 0.82)) return { use: false, reason: "component-union-too-large", componentCount: components.length, totalArea, maxArea, unionArea, uncoveredPaleStructureRatio: paleRatio };
  return { use: true, reason: "accepted", componentCount: components.length, totalArea, maxArea, unionArea, uncoveredPaleStructureRatio: paleRatio };
}

function paleStructureComponents(image) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  for (let y = 0; y < image.height; y += 3) {
    for (let x = 0; x < image.width; x += 3) {
      const idx = y * image.width + x;
      if (visited[idx] || !isPaleStructurePixel(pixel(image, x, y))) continue;
      const queue = [[x, y]];
      visited[idx] = 1;
      let qi = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (qi < queue.length && count < 200000) {
        const [cx, cy] = queue[qi++];
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [[cx + 3, cy], [cx - 3, cy], [cx, cy + 3], [cx, cy - 3]]) {
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const nextIdx = ny * image.width + nx;
          if (visited[nextIdx] || !isPaleStructurePixel(pixel(image, nx, ny))) continue;
          visited[nextIdx] = 1;
          queue.push([nx, ny]);
        }
      }
      const box = expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, image, 8);
      components.push({ box, sampledCount: count, paleStructure: true });
    }
  }
  return components.filter((component) => isUsefulPaleStructureComponent(component, image));
}

function isUsefulPaleStructureComponent(component, image) {
  const areaRatio = component.box.w * component.box.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.006 || areaRatio > 0.38) return false;
  if (component.box.w < 32 || component.box.h < 24) return false;
  if (component.box.w > image.width * 0.9 && component.box.h > image.height * 0.72) return false;
  const sampledRatio = component.sampledCount / Math.max(1, (component.box.w / 3) * (component.box.h / 3));
  return sampledRatio > 0.12;
}

function isPaleStructurePixel(color) {
  if (color.a < 64) return false;
  const lightness = luma(color);
  return lightness >= 170 && lightness <= 242 && saturation(color) < 0.2;
}

function uncoveredPaleStructureRatio(residual, components) {
  let count = 0;
  let total = 0;
  for (let y = 0; y < residual.height; y += 2) {
    for (let x = 0; x < residual.width; x += 2) {
      total += 1;
      if (components.some((component) => pointInsidePxBox(x, y, component.box))) continue;
      const color = pixel(residual, x, y);
      if (isPaleStructurePixel(color)) count += 1;
    }
  }
  return count / Math.max(1, total);
}

function pointInsidePxBox(x, y, box) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

function uniqueSortedLinePositions(values = [], tolerance = 4) {
  const sorted = values
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const out = [];
  for (const value of sorted) {
    if (out.length === 0 || Math.abs(value - out[out.length - 1]) > tolerance) out.push(value);
    else out[out.length - 1] = (out[out.length - 1] + value) / 2;
  }
  return out;
}

function foregroundComponents(image, masks = []) {
  const visited = new Uint8Array(image.width * image.height);
  const components = [];
  for (let y = 0; y < image.height; y += 3) {
    for (let x = 0; x < image.width; x += 3) {
      const idx = y * image.width + x;
      if (visited[idx] || inAnyMask(x, y, masks)) continue;
      if (!isGraphicForeground(pixel(image, x, y))) continue;
      const queue = [[x, y]];
      visited[idx] = 1;
      let qi = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (qi < queue.length && count < 300000) {
        const [cx, cy] = queue[qi++];
        count += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [[cx + 3, cy], [cx - 3, cy], [cx, cy + 3], [cx, cy - 3]]) {
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const nextIdx = ny * image.width + nx;
          if (visited[nextIdx] || inAnyMask(nx, ny, masks)) continue;
          if (!isGraphicForeground(pixel(image, nx, ny))) continue;
          visited[nextIdx] = 1;
          queue.push([nx, ny]);
        }
      }
      const box = expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, image, 8);
      components.push({ box, sampledCount: count });
    }
  }
  return components;
}

function mergeGraphicComponents(components, image) {
  const sorted = components.sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h));
  const merged = [];
  for (const component of sorted) {
    const existing = merged.find((item) => boxesNear(item.box, component.box, 28));
    if (existing) {
      existing.box = expandPxBox(unionBox(existing.box, component.box), image, 0);
      existing.sampledCount += component.sampledCount;
    } else {
      merged.push({ ...component });
    }
  }
  return merged
    .filter((component) => isUsefulGraphicComponent(component, image))
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function expandPxBox(box, image, padding) {
  const x = clamp(Math.floor(box.x - padding), 0, image.width - 1);
  const y = clamp(Math.floor(box.y - padding), 0, image.height - 1);
  const x2 = clamp(Math.ceil(box.x + box.w + padding), x + 1, image.width);
  const y2 = clamp(Math.ceil(box.y + box.h + padding), y + 1, image.height);
  return { x, y, w: x2 - x, h: y2 - y };
}

function isUsefulGraphicComponent(component, image) {
  const { w, h } = component.box;
  const area = w * h;
  if (area < image.width * image.height * 0.0025) return false;
  if (area > image.width * image.height * 0.58) return false;
  if (w < 35 || h < 35) return false;
  if (w > image.width * 0.92 && h > image.height * 0.92) return false;
  if (w > image.width * 0.88 && h > image.height * 0.68) return false;
  return true;
}

function isGraphicForeground(color) {
  if (color.a < 64) return false;
  if (luma(color) > 242 && saturation(color) < 0.12) return false;
  return true;
}

function inAnyMask(x, y, masks) {
  return masks.some((mask) => x >= mask.x && x <= mask.x + mask.w && y >= mask.y && y <= mask.y + mask.h);
}

function unionBox(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

module.exports = { residualSplitComponents, mergeGraphicComponents, boxesNear, expandPxBox, unionBox, isUsefulGraphicComponent, foregroundComponents, inAnyMask, isGraphicForeground, paleStructureComponents, isPaleStructurePixel, isUsefulPaleStructureComponent, residualSplitDecision, uncoveredPaleStructureRatio, pointInsidePxBox, tableGridAwareResidualComponents, slideGridLinesToLocalPx, uniqueSortedLinePositions, lineIntervalIndex, filterTableGridResidualComponents, tableGridAxisGroupedResidualComponents, tableGridAwareResidualSplitDecision, tableGridResidualCandidateScore, wideResidualBandComponents, significantVerticalInkRuns, isBandSignificantPixel, mergeNearbyRuns, trimResidualBandBox, wideResidualBandSplitDecision, continuousWideResidualComponents };
