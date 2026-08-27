"use strict";

function detectColorComponents(image = {}, options = {}) {
  const sampled = buildSampledMask(image, options);
  if (!sampled) return [];
  const { mask, width, height, stride, region } = sampled;
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components = [];
  const minAreaPx = Math.max(1, Number(options.minAreaPx || 1));

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue;
    let top = 0;
    stack[top++] = index;
    visited[index] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let samples = 0;
    while (top > 0) {
      const current = stack[--top];
      const y = Math.floor(current / width);
      const x = current - y * width;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      samples += 1;
      if (x > 0) push(current - 1);
      if (x + 1 < width) push(current + 1);
      if (y > 0) push(current - width);
      if (y + 1 < height) push(current + width);
    }
    const areaPx = samples * stride * stride;
    if (areaPx < minAreaPx) continue;
    components.push({
      x: region.x + minX * stride,
      y: region.y + minY * stride,
      w: Math.min(region.w, (maxX - minX + 1) * stride),
      h: Math.min(region.h, (maxY - minY + 1) * stride),
      areaPx
    });

    function push(next) {
      if (!mask[next] || visited[next]) return;
      visited[next] = 1;
      stack[top++] = next;
    }
  }
  return components.sort((a, b) => a.y - b.y || a.x - b.x);
}

function detectHorizontalColorBands(image = {}, options = {}) {
  const sampled = buildSampledMask(image, options);
  if (!sampled) return [];
  const { mask, width, height, stride, region } = sampled;
  const minRowCoverage = clamp(Number(options.minRowCoverage ?? 0.3), 0.01, 1);
  const minBandHeightPx = Math.max(stride, Number(options.minBandHeightPx || 12));
  const edgeFraction = clamp(Number(options.edgeFraction ?? 0.18), 0.05, 0.45);
  const minColumnCoverage = clamp(Number(options.minColumnCoverage ?? 0.6), 0.05, 1);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const offset = y * width;
    for (let x = 0; x < width; x += 1) count += mask[offset + x];
    rows.push(count / Math.max(1, width) >= minRowCoverage);
  }

  const bands = contiguousRuns(rows)
    .filter(([start, end]) => (end - start + 1) * stride >= minBandHeightPx)
    .map(([startY, endY]) => {
      const bandHeight = endY - startY + 1;
      const edgeRows = Math.max(1, Math.floor(bandHeight * edgeFraction));
      const selectedRows = [];
      for (let y = startY; y < startY + edgeRows; y += 1) selectedRows.push(y);
      for (let y = Math.max(startY, endY - edgeRows + 1); y <= endY; y += 1) selectedRows.push(y);
      const activeColumns = [];
      for (let x = 0; x < width; x += 1) {
        let count = 0;
        for (const y of selectedRows) count += mask[y * width + x];
        activeColumns.push(count / Math.max(1, selectedRows.length) >= minColumnCoverage);
      }
      const run = contiguousRuns(activeColumns).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
      if (!run) return null;
      return {
        x: region.x + run[0] * stride,
        y: region.y + startY * stride,
        w: Math.min(region.w, (run[1] - run[0] + 1) * stride),
        h: Math.min(region.h, bandHeight * stride)
      };
    })
    .filter(Boolean);
  return bands.slice(0, Math.max(1, Number(options.maxBands || bands.length)));
}

function buildSampledMask(image, options) {
  if (!Number.isFinite(Number(image?.width)) || !Number.isFinite(Number(image?.height)) || !image?.rgba) return null;
  if (typeof options.predicate !== "function") return null;
  const stride = Math.max(1, Math.floor(Number(options.stride || 2)));
  const region = normalizeRegion(options.region, image.width, image.height);
  const width = Math.max(1, Math.ceil(region.w / stride));
  const height = Math.max(1, Math.ceil(region.h / stride));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const py = Math.min(image.height - 1, region.y + y * stride);
    for (let x = 0; x < width; x += 1) {
      const px = Math.min(image.width - 1, region.x + x * stride);
      const offset = (py * image.width + px) * 4;
      mask[y * width + x] = options.predicate(image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2], image.rgba[offset + 3]) ? 1 : 0;
    }
  }
  return { mask, width, height, stride, region };
}

function normalizeRegion(region, width, height) {
  const x = clamp(Math.floor(Number(region?.x || 0)), 0, width - 1);
  const y = clamp(Math.floor(Number(region?.y || 0)), 0, height - 1);
  const right = clamp(Math.ceil(Number(region?.x || 0) + Number(region?.w || width)), x + 1, width);
  const bottom = clamp(Math.ceil(Number(region?.y || 0) + Number(region?.h || height)), y + 1, height);
  return { x, y, w: right - x, h: bottom - y };
}

function contiguousRuns(values) {
  const runs = [];
  let start = null;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] && start === null) start = index;
    if (start !== null && (!values[index] || index === values.length - 1)) {
      runs.push([start, values[index] && index === values.length - 1 ? index : index - 1]);
      start = null;
    }
  }
  return runs;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

module.exports = { detectColorComponents, detectHorizontalColorBands };
