"use strict";

function detectFishboneVisualComponents(image = {}, region = {}, colorComponents = [], options = {}) {
  if (!isFishboneSemanticHint(options.semanticHint) || !validImage(image) || !validRegion(region)) return [];
  const skeleton = selectSkeletonComponent(colorComponents, region);
  const cards = selectCardComponents(colorComponents, region, skeleton);
  if (!skeleton || cards.length < 4) return [];

  const mask = createColorMask(image, region, hexToRgb(skeleton.color), options.masks || []);
  const spine = detectHorizontalSpine(mask, region, skeleton.color);
  if (!spine) return [];
  const branches = detectDiagonalBranches(mask, region, spine, skeleton.color);
  if (branches.length < 4) return [];

  return [
    ...cards.map((component) => ({ ...component, kind: "native-rect-candidate", shapeHint: "rect", semanticFishbonePart: true })),
    { ...spine, kind: "grid-line-candidate", shapeHint: "grid-line-horizontal", axis: "h", semanticFishbonePart: true },
    ...branches.map((component) => ({
      ...component,
      kind: "connector-line-candidate",
      shapeHint: "line-diagonal",
      semanticFishbonePart: true
    }))
  ];
}

function isFishboneSemanticHint(value) {
  return /fishbone|cause[-_\s]?effect|branch[-_\s]?analysis|root[-_\s]?cause|鱼骨|因果分析/i.test(String(value || ""));
}

function selectSkeletonComponent(components = [], region = {}) {
  return components
    .filter((component) => component?.box && component.color)
    .filter((component) => {
      const box = component.box;
      const area = Number(box.w || 0) * Number(box.h || 0);
      const density = Number(component.pixelCount || 0) / Math.max(1, area);
      return Number(box.w || 0) >= Number(region.w || 0) * 0.42
        && Number(box.h || 0) >= Number(region.h || 0) * 0.2
        && density >= 0.025
        && density <= 0.45;
    })
    .sort((left, right) => Number(right.pixelCount || 0) - Number(left.pixelCount || 0))[0] || null;
}

function selectCardComponents(components = [], region = {}, skeleton = null) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return components
    .filter((component) => component !== skeleton && component?.box)
    .filter((component) => {
      const box = component.box;
      const area = Number(box.w || 0) * Number(box.h || 0);
      const density = Number(component.pixelCount || 0) / Math.max(1, area);
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      return area / regionArea >= 0.006
        && area / regionArea <= 0.16
        && density >= 0.72
        && aspect >= 1.15
        && aspect <= 7.5;
    })
    .sort((left, right) => Number(left.box.y || 0) - Number(right.box.y || 0) || Number(left.box.x || 0) - Number(right.box.x || 0))
    .slice(0, 16);
}

function createColorMask(image, region, targetRgb, masks = []) {
  const data = new Uint8Array(region.w * region.h);
  for (let ry = 0; ry < region.h; ry += 1) {
    for (let rx = 0; rx < region.w; rx += 1) {
      const x = region.x + rx;
      const y = region.y + ry;
      if (insideAnyMask(x, y, masks)) continue;
      const offset = (y * image.width + x) * 4;
      if (image.rgba[offset + 3] < 16) continue;
      const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
      if (colorDistance(rgb, targetRgb) <= 42) data[ry * region.w + rx] = 1;
    }
  }
  return data;
}

function detectHorizontalSpine(mask, region, color) {
  const rows = [];
  for (let y = 0; y < region.h; y += 1) {
    let count = 0;
    let minX = region.w;
    let maxX = -1;
    for (let x = 0; x < region.w; x += 1) {
      if (!mask[y * region.w + x]) continue;
      count += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    rows.push({ y, count, minX, maxX });
  }
  const peak = rows.reduce((best, row) => row.count > best.count ? row : best, { count: 0 });
  if (peak.count < region.w * 0.38 || peak.maxX - peak.minX < region.w * 0.38) return null;
  const threshold = peak.count * 0.62;
  let top = peak.y;
  let bottom = peak.y;
  while (top > 0 && rows[top - 1].count >= threshold) top -= 1;
  while (bottom + 1 < rows.length && rows[bottom + 1].count >= threshold) bottom += 1;
  const selected = rows.slice(top, bottom + 1);
  const minX = Math.min(...selected.map((row) => row.minX));
  const maxX = Math.max(...selected.map((row) => row.maxX));
  const centerY = (top + bottom) / 2;
  return {
    box: { x: region.x + minX, y: region.y + top, w: maxX - minX + 1, h: bottom - top + 1 },
    pixelCount: selected.reduce((sum, row) => sum + row.count, 0),
    color,
    spineBand: { top, bottom },
    lineEndpointsPx: {
      from: { x: region.x + minX, y: region.y + centerY },
      to: { x: region.x + maxX, y: region.y + centerY }
    }
  };
}

function detectDiagonalBranches(mask, region, spine, color) {
  const visited = new Uint8Array(mask.length);
  const excludedTop = Math.max(0, spine.spineBand.top - 2);
  const excludedBottom = Math.min(region.h - 1, spine.spineBand.bottom + 2);
  const branches = [];
  for (let startY = 0; startY < region.h; startY += 1) {
    for (let startX = 0; startX < region.w; startX += 1) {
      const start = startY * region.w + startX;
      if (!mask[start] || visited[start] || (startY >= excludedTop && startY <= excludedBottom)) continue;
      const points = floodMaskComponent(mask, visited, region, startX, startY, excludedTop, excludedBottom);
      const component = branchFromPoints(points, region, color);
      if (component) branches.push(component);
    }
  }
  return branches
    .filter((component) => component.box.h >= region.h * 0.12 && component.box.w >= region.w * 0.035)
    .sort((left, right) => left.box.x - right.box.x || left.box.y - right.box.y)
    .slice(0, 20);
}

function floodMaskComponent(mask, visited, region, startX, startY, excludedTop, excludedBottom) {
  const queue = [[startX, startY]];
  const points = [];
  visited[startY * region.w + startX] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    points.push({ x, y });
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= region.w || ny >= region.h) continue;
        if (ny >= excludedTop && ny <= excludedBottom) continue;
        const index = ny * region.w + nx;
        if (!mask[index] || visited[index]) continue;
        visited[index] = 1;
        queue.push([nx, ny]);
      }
    }
  }
  return points;
}

function branchFromPoints(points = [], region = {}, color) {
  if (points.length < 24) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  if (maxY - minY < 8 || maxX - minX < 4) return null;
  const top = averagePoint(points.filter((point) => point.y <= minY + 2));
  const bottom = averagePoint(points.filter((point) => point.y >= maxY - 2));
  return {
    box: { x: region.x + minX, y: region.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    pixelCount: points.length,
    color,
    lineEndpointsPx: {
      from: { x: region.x + top.x, y: region.y + top.y },
      to: { x: region.x + bottom.x, y: region.y + bottom.y }
    }
  };
}

function averagePoint(points = []) {
  const count = Math.max(1, points.length);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count
  };
}

function insideAnyMask(x, y, masks = []) {
  return masks.some((box) => x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h);
}

function colorDistance(left, right) {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

function hexToRgb(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || ""));
  if (!match) return [0, 0, 0];
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function validImage(image) {
  return Buffer.isBuffer(image.rgba) && Number.isInteger(image.width) && Number.isInteger(image.height) && image.width > 0 && image.height > 0;
}

function validRegion(region) {
  return [region.x, region.y, region.w, region.h].every(Number.isInteger) && region.w > 0 && region.h > 0 && region.w * region.h <= 100000000;
}

module.exports = {
  detectFishboneVisualComponents,
  _private: { detectDiagonalBranches, detectHorizontalSpine, isFishboneSemanticHint, selectCardComponents, selectSkeletonComponent }
};
