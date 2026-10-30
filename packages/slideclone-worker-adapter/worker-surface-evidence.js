"use strict";

const { createNativeOnlyPanelRefiner } = require("./native-only-panel-refinement");
const { readPng } = require("./worker-input-services");
const { validateDeckIr } = require("./worker-input-services");
const { auditSemanticEditability } = require("./worker-output-services");
const { qualityRendered } = require("./worker-output-services");
const { finalRefinementQualityAcceptable } = require('./worker-quality-policy');
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES } = require("./worker-output-services");
const { colorBrightness, colorDistance, dominantColor, hexColor, pixelColor, ptToPxBox, pxToPtBox, rgbToHex, saturationProxy } = require('./worker-primitives');
const { clusterLightPanelBins } = require("./light-panel-color-cluster");
const { admitsSemanticPanelFill } = require("./semantic-panel-fill-policy");
const { sourceLightCardTextAnchorGeometry } = require('./worker-text-evidence');
const { cardSideAttachmentMatchesGeometry } = require('./worker-job-support');
const { fitSourceLightPanelGeometry } = require("./source-light-panel-geometry");
const { planRedundantPanelBackgrounds } = require("./redundant-panel-backgrounds");
const { orderSourceIconLayers } = require("../slideclone-core/scene-plan/source-icon-layer-order");
const { sampledContainerStrokeColor } = require('./worker-graphic-evidence');

const refineNativeOnlyPanels = createNativeOnlyPanelRefiner({ readPng, fitGeometry: fitDeckLightCardGeometry,
  fitFills: fitDeckLowSaturationPanelFills, validateDeck: validateDeckIr, auditSemantic: auditSemanticEditability,
  qualityRendered, qualityAcceptable: finalRefinementQualityAcceptable, maxPptxBytes: MAX_PPTX_BYTES });

function focusedLightCardStrokeWidthCandidates(currentWidthPt = 0.55) {
  const current = Number.isFinite(currentWidthPt) ? currentWidthPt : 0.55;
  return [0.68, 0.8].filter((width) => width > current + 0.02);
}

function saturatedNativePanelDetector(detector) {
  return new Set([
    "line-text-native-card-row",
    "line-text-native-color-panel",
    "line-text-native-leading-icon-swatch"
  ]).has(String(detector || ""));
}

function fitSaturatedColorPanelToSource(shape, image, slideSize) {
  if (!shape?.box || !image || !slideSize) return null;
  const currentFill = hexColor(shape?.style?.fill);
  if (!currentFill || saturationProxy(currentFill) < 38 || colorBrightness(currentFill) < 35 || colorBrightness(currentFill) > 245) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w * px.h > 2_000_000) return null;
  const pad = Math.max(2, Math.min(96, Math.round(Math.max(px.w, px.h) * 0.65)));
  const scan = {
    x: Math.max(0, px.x - pad),
    y: Math.max(0, px.y - pad)
  };
  scan.w = Math.min(image.width, px.x + px.w + pad) - scan.x;
  scan.h = Math.min(image.height, px.y + px.h + pad) - scan.y;
  if (scan.w < 2 || scan.h < 2 || scan.w * scan.h > 2_000_000) return null;
  const colors = [];
  for (let y = scan.y; y < scan.y + scan.h; y += 1) for (let x = scan.x; x < scan.x + scan.w; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a > 64
      && saturationProxy(color) > 45
      && colorBrightness(color) > 35
      && colorBrightness(color) < 240
      && colorDistance(color, currentFill) <= 78) colors.push(color);
  }
  if (colors.length < Math.max(24, Math.min(px.w * px.h * 0.16, scan.w * scan.h * 0.05))) return null;
  const dominant = dominantColor(colors);
  if (!dominant) return null;
  const seen = new Uint8Array(scan.w * scan.h);
  function localIndex(x, y) { return (y - scan.y) * scan.w + (x - scan.x); }
  function matches(x, y) {
    const color = pixelColor(image, x, y);
    return color.a >= 64
      && saturationProxy(color) >= 42
      && colorBrightness(color) >= 35
      && colorBrightness(color) <= 245
      && colorDistance(color, dominant) <= 62
      && colorDistance(color, currentFill) <= 88;
  }
  const components = [];
  for (let y = scan.y; y < scan.y + scan.h; y += 1) for (let x = scan.x; x < scan.x + scan.w; x += 1) {
    const start = localIndex(x, y);
    if (seen[start] || !matches(x, y)) continue;
    const queue = [[x, y]];
    seen[start] = 1;
    let x1 = x, y1 = y, x2 = x + 1, y2 = y + 1, count = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const [cx, cy] = queue[cursor];
      count += 1; x1 = Math.min(x1, cx); y1 = Math.min(y1, cy); x2 = Math.max(x2, cx + 1); y2 = Math.max(y2, cy + 1);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < scan.x || nx >= scan.x + scan.w || ny < scan.y || ny >= scan.y + scan.h) continue;
        const index = localIndex(nx, ny);
        if (seen[index] || !matches(nx, ny)) continue;
        seen[index] = 1;
        queue.push([nx, ny]);
      }
    }
    const width = x2 - x1;
    const height = y2 - y1;
    if (count < Math.max(24, Math.min(px.w * px.h * 0.12, 220)) || width < Math.max(4, px.w * 0.25) || height < Math.max(4, px.h * 0.35)) continue;
    const overlapX = Math.max(0, Math.min(x2, px.x + px.w) - Math.max(x1, px.x));
    const overlapY = Math.max(0, Math.min(y2, px.y + px.h) - Math.max(y1, px.y));
    const overlapArea = overlapX * overlapY;
    if (overlapArea < Math.max(16, Math.min(px.w * px.h * 0.12, count * 0.2))) continue;
    const centerPenalty = Math.abs((x1 + x2) / 2 - (px.x + px.w / 2)) / Math.max(1, px.w)
      + Math.abs((y1 + y2) / 2 - (px.y + px.h / 2)) / Math.max(1, px.h);
    components.push({ box: { x: x1, y: y1, w: width, h: height }, count, score: overlapArea + count * 0.25 - centerPenalty * 120 });
  }
  const best = components.sort((a, b) => b.score - a.score)[0]?.box;
  if (!best) return null;
  const fitted = pxToPtBox(best, image, slideSize);
  if (fitted.w < Math.max(8, shape.box.w * 0.35) || fitted.h < Math.max(8, shape.box.h * 0.4)
    || fitted.w > shape.box.w * 1.9 || fitted.h > shape.box.h * 1.9) return null;
  return { box: fitted, fill: rgbToHex(dominant) };
}

function fitDeckSaturatedColorPanels(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (!saturatedNativePanelDetector(shape?.source?.detector) || !shape.box || !shape.style) continue;
      const fit = fitSaturatedColorPanelToSource(shape, image, next.slideSize);
      if (!fit) continue;
      const movement = Math.abs(fit.box.x - shape.box.x) + Math.abs(fit.box.y - shape.box.y) + Math.abs(fit.box.w - shape.box.w) + Math.abs(fit.box.h - shape.box.h);
      if (movement < 0.25 && String(shape.style.fill || "").toLowerCase() === fit.fill.toLowerCase()) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fit, priority, score: movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.box = item.fit.box;
    shape.style = { ...shape.style, fill: item.fit.fill, stroke: item.fit.fill };
    shape.source = { ...(shape.source || {}), finalSaturatedColorPanelFit: { provider: "worker-final-saturated-color-panel-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalSaturatedColorPanelFit: { provider: "worker-final-saturated-color-panel-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function dominantLowSaturationPanelColor(shape, image, slideSize) {
  if (!shape?.box || !image || !slideSize) return null;
  const currentFill = hexColor(shape?.style?.fill);
  if (!currentFill) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w * px.h > 2_000_000) return null;
  const insetX = Math.floor(px.w * 0.08);
  const insetY = Math.floor(px.h * 0.08);
  const left = Math.min(px.x + insetX, px.x + px.w - 1);
  const top = Math.min(px.y + insetY, px.y + px.h - 1);
  const right = Math.max(left + 1, px.x + px.w - insetX);
  const bottom = Math.max(top + 1, px.y + px.h - insetY);
  const bins = new Map();
  let sampled = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a < 160 || colorBrightness(color) < 160 || colorBrightness(color) > 253 || saturationProxy(color) > 70) continue;
    sampled += 1;
    const key = `${color.r >> 3},${color.g >> 3},${color.b >> 3}`;
    const current = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += color.r; current.g += color.g; current.b += color.b; current.count += 1;
    bins.set(key, current);
  }
  if (sampled < Math.max(80, (right - left) * (bottom - top) * 0.2)) return null;
  let best = null;
  for (const value of bins.values()) if (!best || value.count > best.count) best = value;
  const fill = best && best.count >= Math.max(40, sampled * 0.28)
    ? { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count }
    : clusterLightPanelBins({ bins: [...bins.values()], sampled });
  if (!fill) return null;
  if (colorDistance(fill, currentFill) < 5 || colorDistance(fill, currentFill) > 42) return null;
  return rgbToHex(fill);
}

function fitDeckLowSaturationPanelFills(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  const detectors = new Set(["line-text-native-title-band-panel", "solid-region-native-background", "line-text-native-card-row"]);
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if ((!detectors.has(String(shape?.source?.detector || "")) && !admitsSemanticPanelFill(shape, next.slideSize)) || !shape.box || !shape.style) continue;
      const fill = dominantLowSaturationPanelColor(shape, image, next.slideSize);
      if (!fill) continue;
      const currentFill = hexColor(shape.style.fill);
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fill, priority, score: currentFill ? colorDistance(hexColor(fill), currentFill) : 0 });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, fill: item.fill };
    shape.source = { ...(shape.source || {}), finalLowSaturationPanelFillFit: { provider: "worker-final-low-saturation-panel-fill-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLowSaturationPanelFillFit: { provider: "worker-final-low-saturation-panel-fill-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function fitDeckLightCardStrokes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetStrokeWidthPt = Number.isFinite(options.targetStrokeWidthPt) ? Math.max(0.55, Math.min(1.1, options.targetStrokeWidthPt)) : 0.8;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "line-text-native-card-row" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      const stroke = hexColor(shape.style.stroke);
      const currentWidth = Number(shape.style.strokeWidthPt);
      if (!fill || !stroke || !Number.isFinite(currentWidth) || currentWidth >= targetStrokeWidthPt) continue;
      if (colorBrightness(fill) < 238 || colorBrightness(stroke) < 210 || colorDistance(fill, stroke) > 42) continue;
      const area = Number(shape.box.w || 0) * Number(shape.box.h || 0);
      if (!Number.isFinite(area) || area < 900) continue;
      const score = area / Math.max(1, colorDistance(fill, stroke));
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, priority, score });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, strokeWidthPt: targetStrokeWidthPt };
  }
  if (selected.length > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalLightCardStrokeFit: {
        provider: "worker-final-light-card-stroke-fit-v1",
        changedShapes: selected.length,
        candidateShapes: candidates.length,
        strokeWidthPt: targetStrokeWidthPt
      }
    };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function lightCardBoundaryPixel(color, fill) {
  if (color.a < 128) return false;
  const brightnessValue = colorBrightness(color);
  if (brightnessValue > 252) return false;
  if (colorDistance(color, fill) < 8) return false;
  return brightnessValue <= 246 || saturationProxy(color) >= 4;
}

function strongProjectionBands(values, threshold) {
  const bands = [];
  let start = null;
  let total = 0;
  let peak = 0;
  for (let index = 0; index <= values.length; index += 1) {
    const value = index < values.length ? values[index] : 0;
    if (value >= threshold) {
      if (start === null) start = index;
      total += value;
      peak = Math.max(peak, value);
    } else if (start !== null) {
      bands.push({ start, end: index, center: (start + index) / 2, total, peak });
      start = null;
      total = 0;
      peak = 0;
    }
  }
  return bands;
}

function selectCardProjectionBand(bands, target, minCenter, maxCenter) {
  return bands
    .filter((band) => band.center >= minCenter && band.center <= maxCenter)
    .map((band) => ({ band, score: band.total + band.peak * 8 - Math.abs(band.center - target) * 3 }))
    .sort((a, b) => b.score - a.score)[0]?.band || null;
}

function sourceLightCardProjectionGeometry(shape, image, slideSize, fill, base, scan) {
  const columnCounts = new Array(scan.w).fill(0);
  const rowCounts = new Array(scan.h).fill(0);
  const columnRuns = new Array(scan.w).fill(0);
  const rowRuns = new Array(scan.h).fill(0);
  for (let y = scan.y; y < scan.y + scan.h; y += 1) {
    for (let x = scan.x; x < scan.x + scan.w; x += 1) {
      if (!lightCardBoundaryPixel(pixelColor(image, x, y), fill)) continue;
      columnCounts[x - scan.x] += 1;
      rowCounts[y - scan.y] += 1;
    }
  }
  for (let x = scan.x; x < scan.x + scan.w; x += 1) {
    let run = 0;
    for (let y = scan.y; y < scan.y + scan.h; y += 1) {
      if (lightCardBoundaryPixel(pixelColor(image, x, y), fill)) {
        run += 1;
        columnRuns[x - scan.x] = Math.max(columnRuns[x - scan.x], run);
      } else {
        run = 0;
      }
    }
  }
  for (let y = scan.y; y < scan.y + scan.h; y += 1) {
    let run = 0;
    for (let x = scan.x; x < scan.x + scan.w; x += 1) {
      if (lightCardBoundaryPixel(pixelColor(image, x, y), fill)) {
        run += 1;
        rowRuns[y - scan.y] = Math.max(rowRuns[y - scan.y], run);
      } else {
        run = 0;
      }
    }
  }
  const verticalThreshold = Math.max(7, Math.round(base.h * 0.42));
  const horizontalThreshold = Math.max(8, Math.round(base.w * 0.35));
  const verticalCountThreshold = Math.max(7, Math.round(base.h * 0.18));
  const horizontalCountThreshold = Math.max(8, Math.round(base.w * 0.18));
  const verticalBands = [...strongProjectionBands(columnRuns, verticalThreshold), ...strongProjectionBands(columnCounts, verticalCountThreshold)]
    .filter((band) => band.end - band.start <= Math.max(16, Math.round(base.w * 0.18)));
  const horizontalBands = [...strongProjectionBands(rowRuns, horizontalThreshold), ...strongProjectionBands(rowCounts, horizontalCountThreshold)]
    .filter((band) => band.end - band.start <= Math.max(12, Math.round(base.h * 0.18)));
  if (verticalBands.length < 1 || horizontalBands.length < 1) return null;
  const baseLeft = base.x - scan.x;
  const baseRight = base.x + base.w - scan.x;
  const baseTop = base.y - scan.y;
  const baseBottom = base.y + base.h - scan.y;
  const left = selectCardProjectionBand(verticalBands, baseLeft, 0, baseLeft + base.w * 0.48);
  const right = selectCardProjectionBand(verticalBands, baseRight, baseRight - base.w * 0.48, scan.w);
  const top = selectCardProjectionBand(horizontalBands, baseTop, 0, baseTop + base.h * 0.5);
  const bottom = selectCardProjectionBand(horizontalBands, baseBottom, baseBottom - base.h * 0.5, scan.h);
  const x1 = left ? scan.x + left.start : base.x;
  const x2 = right ? scan.x + right.end : base.x + base.w;
  const y1 = top ? scan.y + top.start : base.y;
  const y2 = bottom ? scan.y + bottom.end : base.y + base.h;
  const fittedEdges = Number(Boolean(left)) + Number(Boolean(right)) + Number(Boolean(top)) + Number(Boolean(bottom));
  if (fittedEdges < 2 || (Number(Boolean(left)) + Number(Boolean(right)) < 1) || (Number(Boolean(top)) + Number(Boolean(bottom)) < 1)) return null;
  if (x2 <= x1 || y2 <= y1) return null;
  const fitted = pxToPtBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, image, slideSize);
  const movement = Math.abs(fitted.x - shape.box.x) + Math.abs(fitted.y - shape.box.y) + Math.abs(fitted.w - shape.box.w) * 0.5 + Math.abs(fitted.h - shape.box.h) * 0.5;
  return { box: fitted, movement, fittedEdges, provider: "projection" };
}

function sourceLightCardGeometry(shape, image, slideSize, textBoxes = [], options = {}) {
  if (!shape?.box || !shape?.style || !image || !slideSize) return null;
  const fill = hexColor(shape.style.fill);
  if (!fill || colorBrightness(fill) < 238) return null;
  const base = ptToPxBox(shape.box, image, slideSize);
  if (!base || base.w < 18 || base.h < 18) return null;
  const projectionPad = Math.max(8, Math.round(Math.min(base.w, base.h) * 0.42));
  const projectionScan = {
    x: Math.max(0, base.x - projectionPad),
    y: Math.max(0, base.y - projectionPad),
    w: Math.min(image.width, base.x + base.w + projectionPad) - Math.max(0, base.x - projectionPad),
    h: Math.min(image.height, base.y + base.h + projectionPad) - Math.max(0, base.y - projectionPad)
  };
  if (projectionScan.w * projectionScan.h > 500_000) return null;
  const projection = sourceLightCardProjectionGeometry(shape, image, slideSize, fill, base, projectionScan);
  const pad = Math.max(5, Math.round(Math.min(base.w, base.h) * 0.22));
  const scan = {
    x: Math.max(0, base.x - pad),
    y: Math.max(0, base.y - pad),
    w: Math.min(image.width, base.x + base.w + pad) - Math.max(0, base.x - pad),
    h: Math.min(image.height, base.y + base.h + pad) - Math.max(0, base.y - pad)
  };
  if (scan.w * scan.h > 500_000) return null;
  const seen = new Uint8Array(scan.w * scan.h);
  function localIndex(x, y) { return (y - scan.y) * scan.w + (x - scan.x); }
  function isEdgePixel(x, y) {
    const color = pixelColor(image, x, y);
    if (!lightCardBoundaryPixel(color, fill)) return false;
    return saturationProxy(color) >= 8 || colorBrightness(color) <= 235;
  }
  const components = [];
  for (let y = scan.y; y < scan.y + scan.h; y += 1) {
    for (let x = scan.x; x < scan.x + scan.w; x += 1) {
      const start = localIndex(x, y);
      if (seen[start] || !isEdgePixel(x, y)) continue;
      const queue = [[x, y]];
      seen[start] = 1;
      let x1 = x, y1 = y, x2 = x + 1, y2 = y + 1, count = 0;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [cx, cy] = queue[cursor];
        count += 1; x1 = Math.min(x1, cx); y1 = Math.min(y1, cy); x2 = Math.max(x2, cx + 1); y2 = Math.max(y2, cy + 1);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < scan.x || nx >= scan.x + scan.w || ny < scan.y || ny >= scan.y + scan.h) continue;
          const index = localIndex(nx, ny);
          if (seen[index] || !isEdgePixel(nx, ny)) continue;
          seen[index] = 1;
          queue.push([nx, ny]);
        }
      }
      const width = x2 - x1;
      const height = y2 - y1;
      if (count < 18 || width < base.w * 0.35 || height < base.h * 0.25) continue;
      components.push({ x: x1, y: y1, w: width, h: height, count });
    }
  }
  const baseCenterX = base.x + base.w / 2;
  const baseCenterY = base.y + base.h / 2;
  const best = components
    .map((box) => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const centerPenalty = Math.abs(cx - baseCenterX) / Math.max(1, base.w) + Math.abs(cy - baseCenterY) / Math.max(1, base.h);
      const sizePenalty = Math.abs(box.w - base.w) / Math.max(1, base.w) + Math.abs(box.h - base.h) / Math.max(1, base.h);
      return { box, score: box.count - (centerPenalty + sizePenalty) * 80 };
    })
    .sort((a, b) => b.score - a.score)[0]?.box;
  let connected = null;
  if (best) {
    const fitted = pxToPtBox(best, image, slideSize);
    const movement = Math.abs(fitted.x - shape.box.x) + Math.abs(fitted.y - shape.box.y) + Math.abs(fitted.w - shape.box.w) * 0.5 + Math.abs(fitted.h - shape.box.h) * 0.5;
    connected = { box: fitted, movement, provider: "component" };
  }
  const allowTextAnchorGeometry = options.allowTextAnchorGeometry !== false;
  const textAnchor = allowTextAnchorGeometry ? sourceLightCardTextAnchorGeometry(shape, textBoxes, slideSize) : null;
  const candidates = [projection, connected, textAnchor].filter(Boolean).filter((item) =>
    item.box.w >= shape.box.w * 0.55
    && item.box.w <= shape.box.w * 1.35
    && item.box.h >= shape.box.h * 0.45
    && item.box.h <= shape.box.h * 1.35
    && item.movement >= 0.4
    && item.movement <= Math.max(30, Math.max(shape.box.w, shape.box.h) * 0.45));
  return candidates.sort((a, b) =>
    (b.fittedEdges || 0) - (a.fittedEdges || 0)
    || (a.provider === "text-anchor" ? -0.5 : 0) - (b.provider === "text-anchor" ? -0.5 : 0)
    || Math.abs(a.movement - shape.box.h * 0.12) - Math.abs(b.movement - shape.box.h * 0.12))[0] || null;
}

function adjustCardSideAccentForGeometry(accent, oldBox, newBox) {
  if (!accent?.box || !oldBox || !newBox) return;
  const side = String(accent?.source?.side || accent?.source?.supportedSide || "");
  const box = accent.box;
  const xRatio = oldBox.w > 0 ? newBox.w / oldBox.w : 1;
  const yRatio = oldBox.h > 0 ? newBox.h / oldBox.h : 1;
  if (side === "left" || side === "right") {
    box.x = side === "left" ? newBox.x : newBox.x + newBox.w;
    box.y = newBox.y + (Number(box.y || 0) - oldBox.y) * yRatio;
    box.h = Math.max(0, Number(box.h || 0) * yRatio);
    return;
  }
  if (side === "top" || side === "bottom") {
    box.x = newBox.x + (Number(box.x || 0) - oldBox.x) * xRatio;
    box.y = side === "top" ? newBox.y : newBox.y + newBox.h;
    box.w = Math.max(0, Number(box.w || 0) * xRatio);
  }
}

function isCardSideGeometryAttachment(accent, cardId) {
  const source = accent?.source;
  if (!source || typeof source !== "object") return false;
  const detector = String(source.detector || "");
  if (detector === "line-text-native-card-side-accent" && String(source.sourceCardId || "") === cardId) return true;
  return detector === "source-native-edge-refinement" && String(source.sourceShapeId || "") === cardId;
}

function reassignSourceNativeEdgeLineOwners(shapes) {
  if (!Array.isArray(shapes)) return 0;
  const cards = shapes.filter((shape) => shape?.source?.detector === "line-text-native-card-row" && shape.box && shape.id);
  if (cards.length < 2) return 0;
  let reassigned = 0;
  for (const line of shapes) {
    const source = line?.source;
    if (!source || typeof source !== "object" || source.detector !== "source-native-edge-refinement" || !line.box) continue;
    const currentId = String(source.sourceShapeId || "");
    let best = null;
    for (const card of cards) {
      if (!cardSideAttachmentMatchesGeometry(line, card.box)) continue;
      const side = String(source.supportedSide || "");
      const lineBox = line.box;
      const cardBox = card.box;
      const axisDistance = side === "left" || side === "right"
        ? Math.abs(Number(lineBox.x || 0) - (side === "left" ? Number(cardBox.x || 0) : Number(cardBox.x || 0) + Number(cardBox.w || 0)))
        : Math.abs(Number(lineBox.y || 0) - (side === "top" ? Number(cardBox.y || 0) : Number(cardBox.y || 0) + Number(cardBox.h || 0)));
      const overlap = side === "left" || side === "right"
        ? Math.min(Number(lineBox.y || 0) + Number(lineBox.h || 0), Number(cardBox.y || 0) + Number(cardBox.h || 0)) - Math.max(Number(lineBox.y || 0), Number(cardBox.y || 0))
        : Math.min(Number(lineBox.x || 0) + Number(lineBox.w || 0), Number(cardBox.x || 0) + Number(cardBox.w || 0)) - Math.max(Number(lineBox.x || 0), Number(cardBox.x || 0));
      const score = overlap - axisDistance * 2;
      if (!best || score > best.score) best = { card, score };
    }
    if (best?.card?.id && String(best.card.id) !== currentId) {
      line.source = {
        ...source,
        sourceShapeId: String(best.card.id),
        sourceNativeEdgeOwnerReassigned: {
          provider: "worker-source-native-edge-owner-reassign-v1",
          previousSourceShapeId: currentId
        }
      };
      reassigned += 1;
    }
  }
  return reassigned;
}

function fitDeckLightCardGeometry(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  let reassignedSourceEdgeLines = 0;
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    reassignedSourceEdgeLines += reassignSourceNativeEdgeLineOwners(shapes);
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (!shape?.box || !shape.style) continue;
      const fit = shape?.source?.detector === "line-text-native-card-row"
        ? sourceLightCardGeometry(shape, image, next.slideSize, next.pages[pageIndex]?.textBoxes || [], { allowTextAnchorGeometry: options.allowTextAnchorGeometry })
        : fitSourceLightPanelGeometry(shape, image, next.slideSize);
      if (!fit) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fit, priority, score: fit.movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  const changedComponentKeys = [];
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    const oldBox = { ...shape.box };
    if (typeof shape.id === "string" && shape.id) changedComponentKeys.push(`${item.pageIndex}:${shape.id}`);
    shape.box = item.fit.box;
    shape.source = {
      ...(shape.source || {}),
      ...(item.fit.provider === "source-light-panel-transition" ? { finalLightPanelSourceGeometryFit: { provider: "worker-source-light-panel-transition-v1", fittedEdges: 4 } } : {}),
      ...(item.fit.provider === "text-anchor" ? { finalLightCardTextAnchorGeometryFit: { provider: "worker-final-light-card-text-anchor-geometry-fit-v1" } } : {})
    };
    for (const accent of next.pages[item.pageIndex].shapes) {
      if (!isCardSideGeometryAttachment(accent, String(shape.id || ""))) continue;
      if (!cardSideAttachmentMatchesGeometry(accent, oldBox)) continue;
      adjustCardSideAccentForGeometry(accent, oldBox, item.fit.box);
    }
  }
  let removedBackgrounds = 0, reorderedSourceIconShapes = 0;
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex++) {
    const page = next.pages[pageIndex];
    const otherObjects = [page.textBoxes, page.images, page.icons, page.tables, page.charts].flatMap(items => Array.isArray(items) ? items : []);
    const plans = planRedundantPanelBackgrounds(page.shapes, next.slideSize, otherObjects);
    const ids = new Set(plans.map(plan => plan.removedId));
    page.shapes = page.shapes.filter(shape => !ids.has(shape.id));
    removedBackgrounds += plans.length;
    for (const plan of plans) if (!changedComponentKeys.includes(`${pageIndex}:${plan.ownerId}`)) changedComponentKeys.push(`${pageIndex}:${plan.ownerId}`);
    const ordered = orderSourceIconLayers(page.shapes, next.slideSize);
    page.shapes = ordered.shapes;
    reorderedSourceIconShapes += ordered.movedShapes;
  }
  const changedShapes = selected.length + removedBackgrounds + reorderedSourceIconShapes;
  if (changedShapes > 0 || reassignedSourceEdgeLines > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardGeometryFit: { provider: "worker-final-light-card-geometry-fit-v1", changedShapes, candidateShapes: candidates.length, removedBackgrounds, reorderedSourceIconShapes, reassignedSourceEdgeLines, changedComponentKeys } };
  }
  return { deck: next, changedShapes, candidateShapes: candidates.length, removedBackgrounds, reassignedSourceEdgeLines, changedComponentKeys };
}

function fitDeckLightCardStrokeColors(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "line-text-native-card-row" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      if (!fill || colorBrightness(fill) < 238) continue;
      const stroke = hexColor(shape.style.stroke);
      const sampled = sampledContainerStrokeColor(shape, image, next.slideSize);
      if (!stroke || !sampled) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, stroke: sampled, priority, score: colorDistance(hexColor(sampled), stroke) });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, stroke: item.stroke };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardStrokeColorFit: { provider: "worker-final-light-card-stroke-color-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function fitDeckLightCardSourceStrokes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetStrokeWidthPt = Number.isFinite(options.targetStrokeWidthPt) ? Math.max(0.55, Math.min(1.1, options.targetStrokeWidthPt)) : 0.68;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "line-text-native-card-row" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      if (!fill || colorBrightness(fill) < 238) continue;
      if (shape.source?.finalLightCardSourceStrokeFit?.provider === "worker-final-light-card-source-stroke-fit-v1") continue;
      const currentWidth = Number(shape.style.strokeWidthPt);
      if (Number.isFinite(currentWidth) && currentWidth >= targetStrokeWidthPt) continue;
      const sampled = sampledContainerStrokeColor(shape, image, next.slideSize);
      if (!sampled) continue;
      const area = Number(shape.box.w || 0) * Number(shape.box.h || 0);
      if (!Number.isFinite(area) || area < 900) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, stroke: sampled, priority, score: area });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, stroke: item.stroke, strokeWidthPt: targetStrokeWidthPt };
    shape.source = { ...(shape.source || {}), finalLightCardSourceStrokeFit: { provider: "worker-final-light-card-source-stroke-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardSourceStrokeFit: { provider: "worker-final-light-card-source-stroke-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length, strokeWidthPt: targetStrokeWidthPt } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function sourceLightCardSideAccents(shape, image, slideSize) {
  if (shape?.source?.detector !== "line-text-native-card-row" || !shape?.box || !shape?.style || !image || !slideSize) return [];
  const fill = hexColor(shape.style.fill);
  if (!fill || colorBrightness(fill) < 238) return [];
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w < 16 || px.h < 16 || px.w * px.h > 1_500_000) return [];
  const band = Math.max(3, Math.min(10, Math.round(Math.min(px.w, px.h) * 0.1)));
  const sides = [
    { name: "left", x1: px.x, y1: px.y, x2: Math.min(image.width, px.x + band), y2: px.y + px.h, vertical: true },
    { name: "right", x1: Math.max(0, px.x + px.w - band), y1: px.y, x2: px.x + px.w, y2: px.y + px.h, vertical: true },
    { name: "top", x1: px.x, y1: px.y, x2: px.x + px.w, y2: Math.min(image.height, px.y + band), vertical: false },
    { name: "bottom", x1: px.x, y1: Math.max(0, px.y + px.h - band), x2: px.x + px.w, y2: px.y + px.h, vertical: false },
  ];
  const accents = [];
  for (const side of sides) {
    const colors = [];
    const parallel = [];
    const perpendicular = [];
    const covered = new Set();
    for (let y = Math.max(0, side.y1); y < Math.min(image.height, side.y2); y += 1) {
      for (let x = Math.max(0, side.x1); x < Math.min(image.width, side.x2); x += 1) {
        const color = pixelColor(image, x, y);
        const brightnessValue = colorBrightness(color);
        const saturationValue = saturationProxy(color);
        if (color.a < 128 || brightnessValue < 35 || brightnessValue > 250) continue;
        if (colorDistance(color, fill) < 18 || saturationValue < 8) continue;
        colors.push(color);
        parallel.push(side.vertical ? y : x);
        perpendicular.push(side.vertical ? x : y);
        covered.add(side.vertical ? y : x);
      }
    }
    const lengthPx = side.vertical ? px.h : px.w;
    if (colors.length < Math.max(18, lengthPx * 0.22) || covered.size < Math.max(8, lengthPx * 0.32)) continue;
    parallel.sort((a, b) => a - b);
    perpendicular.sort((a, b) => a - b);
    const p1 = parallel[0];
    const p2 = parallel[parallel.length - 1] + 1;
    const q1 = perpendicular[0];
    const q2 = perpendicular[perpendicular.length - 1] + 1;
    const thicknessPx = q2 - q1;
    if (thicknessPx > Math.max(8, band * 1.35) || p2 - p1 < lengthPx * 0.3) continue;
    const dominant = dominantColor(colors);
    if (!dominant) continue;
    const scale = side.vertical ? image.width / slideSize.widthPt : image.height / slideSize.heightPt;
    const strokeWidthPt = Math.max(0.35, Math.min(2.4, thicknessPx / Math.max(0.1, scale)));
    const color = rgbToHex(dominant);
    const score = covered.size + colors.length * 0.1 + colorDistance(dominant, fill) * 0.5;
    if (side.vertical) {
      const x = (q1 + q2) / 2 * slideSize.widthPt / image.width;
      accents.push({
        side: side.name,
        color,
        strokeWidthPt,
        score,
        box: { x, y: p1 * slideSize.heightPt / image.height, w: 0, h: (p2 - p1) * slideSize.heightPt / image.height }
      });
    } else {
      const y = (q1 + q2) / 2 * slideSize.heightPt / image.height;
      accents.push({
        side: side.name,
        color,
        strokeWidthPt,
        score,
        box: { x: p1 * slideSize.widthPt / image.width, y, w: (p2 - p1) * slideSize.widthPt / image.width, h: 0 }
      });
    }
  }
  return accents;
}

function fitDeckLightCardSideAccents(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    const shapes = Array.isArray(page?.shapes) ? page.shapes : [];
    const image = pageImages[pageIndex];
    const existingIds = new Set(shapes.map((shape) => String(shape?.id || "")));
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const accents = sourceLightCardSideAccents(shape, image, next.slideSize);
      if (accents.length < 1) continue;
      const priorityKey = `${pageIndex}:${shape.id}`;
      if (priorityIds.size > 0 && !priorityIds.has(priorityKey)) continue;
      const priority = priorityIds.has(priorityKey) ? priorityIds.get(priorityKey) : Number.MAX_SAFE_INTEGER;
      for (const accent of accents) {
        const id = `${shape.id || `card-${index}`}-source-side-accent-${accent.side}`;
        if (existingIds.has(id)) continue;
        candidates.push({ pageIndex, index, id, accent, priority, score: accent.score });
      }
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index || a.accent.side.localeCompare(b.accent.side)).slice(0, candidateLimit));
  for (const item of selected) {
    const page = next.pages[item.pageIndex];
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    page.shapes.push({
      id: item.id,
      type: "line",
      box: item.accent.box,
      style: {
        stroke: item.accent.color,
        strokeWidthPt: item.accent.strokeWidthPt,
        connectorType: "straight",
        lineCap: "round"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "line-text-native-card-side-accent",
        sourceCardId: String(page.shapes[item.index]?.id || ""),
        side: item.accent.side
      }
    });
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardSideAccentFit: { provider: "worker-final-light-card-side-accent-fit-v1", addedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, addedShapes: selected.length, candidateShapes: candidates.length };
}

module.exports = { refineNativeOnlyPanels, focusedLightCardStrokeWidthCandidates, saturatedNativePanelDetector, fitSaturatedColorPanelToSource, fitDeckSaturatedColorPanels, dominantLowSaturationPanelColor, fitDeckLowSaturationPanelFills, fitDeckLightCardStrokes, lightCardBoundaryPixel, strongProjectionBands, selectCardProjectionBand, sourceLightCardProjectionGeometry, sourceLightCardGeometry, adjustCardSideAccentForGeometry, isCardSideGeometryAttachment, reassignSourceNativeEdgeLineOwners, fitDeckLightCardGeometry, fitDeckLightCardStrokeColors, fitDeckLightCardSourceStrokes, sourceLightCardSideAccents, fitDeckLightCardSideAccents };
