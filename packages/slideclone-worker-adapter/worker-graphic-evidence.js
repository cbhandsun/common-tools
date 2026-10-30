"use strict";

const { colorBrightness, colorDistance, dominantColor, hexColor, pixelColor, ptToPxBox, rgbToHex, saturationProxy } = require('./worker-primitives');

function fitDeckNativeShapeThinStrokes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const strokeWidthMultiplier = Number.isFinite(options.strokeWidthMultiplier)
    ? Math.max(0.45, Math.min(0.92, Number(options.strokeWidthMultiplier)))
    : 0.75;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const strokeWidthPt = Number(shape?.style?.strokeWidthPt);
      if (shape?.source?.nativeRebuild !== true
        || shape?.type === "line"
        || shape?.style?.stroke === "none"
        || !Number.isFinite(strokeWidthPt)
        || strokeWidthPt <= 0
        || strokeWidthPt > 2.5) continue;
      const box = shape?.box || {};
      const area = Number(box.w || 0) * Number(box.h || 0);
      if (!Number.isFinite(area) || area <= 0) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, priority, score: area * strokeWidthPt });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    const strokeWidthPt = Number(shape.style.strokeWidthPt);
    shape.style = { ...shape.style, strokeWidthPt: Math.max(0.25, Math.round(strokeWidthPt * strokeWidthMultiplier * 100) / 100) };
    shape.source = { ...(shape.source || {}), finalNativeShapeThinStrokeFit: { provider: "worker-final-native-shape-thin-stroke-fit-v1", strokeWidthMultiplier } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalNativeShapeThinStrokeFit: { provider: "worker-final-native-shape-thin-stroke-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length, strokeWidthMultiplier } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function fitDeckWorstConnectorStyles(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const strokeWidthMultiplier = Number.isFinite(options.strokeWidthMultiplier) && options.strokeWidthMultiplier > 0 ? options.strokeWidthMultiplier : 1;
  const lineCap = typeof options.lineCap === "string" && options.lineCap ? options.lineCap : null;
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const priorityKey = `${pageIndex}:${shape?.id || ""}`;
      const strokeWidthPt = Number(shape?.style?.strokeWidthPt);
      if (priorityIds.size > 0 && !priorityIds.has(priorityKey)) continue;
      if (shape?.type !== "line"
        || shape?.style?.connectorType !== "straight"
        || shape?.style?.stroke === "none"
        || !Number.isFinite(strokeWidthPt)
        || strokeWidthPt <= 0
        || strokeWidthPt > 6
        || !shape?.box
        || (!Number.isFinite(Number(shape.box.w)) && !Number.isFinite(Number(shape.box.h)))) continue;
      const priority = priorityIds.has(priorityKey) ? priorityIds.get(priorityKey) : Number.MAX_SAFE_INTEGER;
      const length = Math.max(Math.abs(Number(shape.box.w) || 0), Math.abs(Number(shape.box.h) || 0));
      if (!Number.isFinite(length) || length < 8) continue;
      candidates.push({ pageIndex, index, priority, score: length * strokeWidthPt });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    const strokeWidthPt = Number(shape.style.strokeWidthPt);
    shape.style = {
      ...shape.style,
      strokeWidthPt: Math.max(0.25, Math.min(8, Math.round(strokeWidthPt * strokeWidthMultiplier * 100) / 100)),
      ...(lineCap ? { lineCap } : {})
    };
    shape.source = { ...(shape.source || {}), finalWorstConnectorStyleFit: { provider: "worker-final-worst-connector-style-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalWorstConnectorStyleFit: {
        provider: "worker-final-worst-connector-style-fit-v1",
        changedShapes: selected.length,
        candidateShapes: candidates.length,
        strokeWidthMultiplier,
        ...(lineCap ? { lineCap } : {})
      }
    };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}

function sampledLowContrastFooterMarkFill(shape, image, slideSize) {
  if (!shape?.box || !image || !slideSize) return null;
  const current = hexColor(shape?.style?.fill);
  if (!current) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w < 4 || px.h < 4 || px.w * px.h > 80_000) return null;
  const colors = [];
  for (let y = px.y; y < px.y + px.h; y += 1) for (let x = px.x; x < px.x + px.w; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a <= 128) continue;
    const brightnessValue = colorBrightness(color);
    if (brightnessValue >= 245 && saturationProxy(color) <= 18) continue;
    if (brightnessValue < 95 || brightnessValue > 235 || saturationProxy(color) > 55) continue;
    colors.push(color);
  }
  if (colors.length < Math.max(8, px.w * px.h * 0.12)) return null;
  colors.sort((left, right) => colorBrightness(left) - colorBrightness(right));
  const sampled = rgbToHex(colors[Math.floor(colors.length / 2)]);
  if (colorDistance(hexColor(sampled), current) < 5) return null;
  return sampled;
}

function sampledContainerStrokeColor(shape, image, slideSize) {
  if (!shape?.box || !shape?.style || !image || !slideSize) return null;
  const fill = hexColor(shape.style.fill);
  const stroke = hexColor(shape.style.stroke) || fill;
  if (!fill || !stroke) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w < 12 || px.h < 12 || px.w * px.h > 1_500_000) return null;
  const band = Math.max(2, Math.min(6, Math.round(Math.min(px.w, px.h) * 0.08)));
  const colors = [];
  for (let y = px.y; y < px.y + px.h; y += 1) for (let x = px.x; x < px.x + px.w; x += 1) {
    const edge = x - px.x < band || px.x + px.w - 1 - x < band || y - px.y < band || px.y + px.h - 1 - y < band;
    if (!edge) continue;
    const color = pixelColor(image, x, y);
    const brightnessValue = colorBrightness(color);
    const saturationValue = saturationProxy(color);
    if (color.a < 160 || brightnessValue > 252 || colorDistance(color, fill) < 12) continue;
    if (brightnessValue < 52 || saturationValue < 6) continue;
    colors.push(color);
  }
  if (colors.length < Math.max(12, (px.w + px.h) * 0.08)) return null;
  const dominant = dominantColor(colors);
  if (!dominant) return null;
  if (colorDistance(dominant, stroke) < 8) return null;
  if (colorDistance(dominant, fill) < 12) return null;
  return rgbToHex(dominant);
}

function sourceComponentFidelityForeground(source, rendered, x, y) {
  const offset = (y * source.width + x) * 4;
  const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2], a: source.rgba[offset + 3] };
  if (color.a < 128) return false;
  const brightnessValue = colorBrightness(color);
  const saturationValue = saturationProxy(color);
  if (brightnessValue >= 253) return false;
  if (brightnessValue < 245 && (brightnessValue < 210 || saturationValue > 18)) return true;
  return sourceRenderedDelta(source, rendered, x, y) > 5
    && (brightnessValue < 250 || saturationValue > 4);
}

function sourceRenderedDelta(source, rendered, x, y) {
  const sourceOffset = (y * source.width + x) * 4;
  const renderedX = Math.min(rendered.width - 1, Math.round(x * rendered.width / source.width));
  const renderedY = Math.min(rendered.height - 1, Math.round(y * rendered.height / source.height));
  const renderedOffset = (renderedY * rendered.width + renderedX) * 4;
  return (Math.abs(source.rgba[sourceOffset] - rendered.rgba[renderedOffset])
    + Math.abs(source.rgba[sourceOffset + 1] - rendered.rgba[renderedOffset + 1])
    + Math.abs(source.rgba[sourceOffset + 2] - rendered.rgba[renderedOffset + 2])
    + Math.abs(source.rgba[sourceOffset + 3] - rendered.rgba[renderedOffset + 3])) / 4;
}

function sourcePixelHex(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return rgbToHex({ r: image.rgba[offset], g: image.rgba[offset + 1], b: image.rgba[offset + 2] });
}

function isFiniteLineBox(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])))
    && (Math.abs(Number(value.w)) > 0 || Math.abs(Number(value.h)) > 0);
}

function medianLineThickness(boxes, orientation) {
  const values = boxes
    .map((box) => Number(orientation === "horizontal" ? box.h : box.w))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (values.length < 1) return 1;
  return values[Math.floor(values.length / 2)];
}

function visualFidelityPassed(quality) {
  return Array.isArray(quality?.checks)
    && quality.checks.some((check) => check?.name === "visual-fidelity" && check.passed === true);
}

module.exports = { fitDeckNativeShapeThinStrokes, fitDeckWorstConnectorStyles, sampledLowContrastFooterMarkFill, sampledContainerStrokeColor, sourceComponentFidelityForeground, sourceRenderedDelta, sourcePixelHex, isFiniteLineBox, medianLineThickness, visualFidelityPassed };
