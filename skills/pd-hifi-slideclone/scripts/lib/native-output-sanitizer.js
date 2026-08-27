"use strict";

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });
const MAX_SHAPES = 20000;
const MAX_FREEFORM_POINTS = 4096;

function sanitizeNativeCharts(charts, slideSize = DEFAULT_SLIDE) {
  if (!Array.isArray(charts)) return [];
  const safeCharts = [];
  for (const chart of charts.slice(0, 12)) {
    const safe = sanitizeNativeChart(chart, safeCharts.length, slideSize);
    if (safe) safeCharts.push(safe);
  }
  return safeCharts;
}

function sanitizeNativeShapes(shapes = [], slideSize = DEFAULT_SLIDE) {
  if (!Array.isArray(shapes)) return [];
  return shapes.slice(0, MAX_SHAPES)
    .map((shape) => sanitizeNativeShape(shape, slideSize))
    .filter(Boolean);
}

function sanitizeNativeShape(shape, slideSize = DEFAULT_SLIDE) {
  if (!shape || typeof shape !== "object" || Array.isArray(shape)) return null;
  const type = String(shape.type || "").toLowerCase();
  if (type !== "freeform" && type !== "polyline") return shape;
  const points = Array.isArray(shape.points) ? shape.points.slice(0, MAX_FREEFORM_POINTS) : [];
  if (points.length === 0) return shape;
  const numericPoints = points
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (numericPoints.length !== points.length || points.length !== shape.points.length) {
    return { ...shape, points: numericPoints };
  }
  const alreadyRelative = numericPoints.every((point) =>
    point.x >= -0.001 && point.x <= 1.001 && point.y >= -0.001 && point.y <= 1.001
  );
  if (alreadyRelative) return shape;
  const absoluteBox = clampPtBoxToSlide(freeformBounds(numericPoints), slideSize);
  const safeW = Math.max(0.1, Number(absoluteBox.w || 0));
  const safeH = Math.max(0.1, Number(absoluteBox.h || 0));
  return {
    ...shape,
    box: absoluteBox,
    points: numericPoints.map((point) => ({
      x: roundRatio((point.x - Number(absoluteBox.x || 0)) / safeW),
      y: roundRatio((point.y - Number(absoluteBox.y || 0)) / safeH)
    })),
    source: { ...(shape.source || {}), nativePointCoordinateSanitized: true }
  };
}

function sanitizeNativeChart(chart, fallbackIndex, slideSize = DEFAULT_SLIDE) {
  if (!chart || typeof chart !== "object" || Array.isArray(chart)) return null;
  const box = sanitizeBox(chart.box, slideSize);
  if (!box) return null;
  const values = sanitizeNumberArray(chart.values, 24);
  const series = sanitizeChartSeries(chart.series);
  if (values.length === 0 && series.length === 0) return null;
  const valueCount = values.length || Math.max(...series.map((item) => item.values.length), 0);
  if (valueCount <= 0) return null;
  return {
    id: safeIdentifier(chart.id, `native-chart-${fallbackIndex + 1}`),
    type: safeChartType(chart.type),
    box,
    style: sanitizeChartStyle(chart.style),
    categories: sanitizeStringArray(chart.categories, valueCount),
    ...(values.length > 0 ? { values } : {}),
    ...(series.length > 0 ? { series } : {}),
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "structured-data-chart",
      expressionForm: "data-chart",
      reason: "structured-chart-data-promoted-to-native-editable-chart"
    }
  };
}

function sanitizeBox(box, slideSize = DEFAULT_SLIDE) {
  if (!box || typeof box !== "object" || Array.isArray(box)) return null;
  const x = finiteNumber(box.x);
  const y = finiteNumber(box.y);
  const w = finiteNumber(box.w);
  const h = finiteNumber(box.h);
  if ([x, y, w, h].some((value) => value === null) || w < 8 || h < 8) return null;
  const safeSlide = normalizeSlideSize(slideSize);
  if (x < -safeSlide.widthPt || y < -safeSlide.heightPt || x > safeSlide.widthPt * 2 || y > safeSlide.heightPt * 2) return null;
  return {
    x: roundNumber(Math.max(0, Math.min(safeSlide.widthPt, x))),
    y: roundNumber(Math.max(0, Math.min(safeSlide.heightPt, y))),
    w: roundNumber(Math.min(safeSlide.widthPt, w)),
    h: roundNumber(Math.min(safeSlide.heightPt, h))
  };
}

function sanitizeChartSeries(series) {
  if (!Array.isArray(series)) return [];
  return series.slice(0, 6).map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const values = sanitizeNumberArray(item.values, 24);
    return values.length ? { name: truncateText(item.name || `Series ${index + 1}`, 80), values } : null;
  }).filter(Boolean);
}

function sanitizeNumberArray(values, maxItems) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, maxItems).map(finiteNumber).filter((value) => value !== null).map(roundNumber);
}

function sanitizeStringArray(values, maxItems) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, maxItems).map((value) => truncateText(value, 80)).filter(Boolean);
}

function sanitizeChartStyle(style) {
  if (!style || typeof style !== "object" || Array.isArray(style)) return {};
  const safe = {};
  for (const key of ["fill", "stroke", "barFill", "accent", "axisColor", "textColor"]) {
    if (typeof style[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(style[key])) safe[key] = style[key].toUpperCase();
  }
  if (typeof style.fontFamily === "string") safe.fontFamily = truncateText(style.fontFamily, 80);
  const fontSizePt = finiteNumber(style.fontSizePt);
  if (fontSizePt !== null) safe.fontSizePt = roundNumber(Math.max(4, Math.min(40, fontSizePt)));
  return safe;
}

function normalizeSlideSize(slideSize) {
  const widthPt = finiteNumber(slideSize?.widthPt);
  const heightPt = finiteNumber(slideSize?.heightPt);
  return {
    widthPt: widthPt !== null && widthPt >= 100 && widthPt <= 10000 ? widthPt : DEFAULT_SLIDE.widthPt,
    heightPt: heightPt !== null && heightPt >= 100 && heightPt <= 10000 ? heightPt : DEFAULT_SLIDE.heightPt
  };
}

function freeformBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function clampPtBoxToSlide(box, slideSize) {
  const safeSlide = normalizeSlideSize(slideSize);
  const x = Math.max(0, Math.min(safeSlide.widthPt, Number(box.x || 0)));
  const y = Math.max(0, Math.min(safeSlide.heightPt, Number(box.y || 0)));
  return {
    x: roundGeometry(x),
    y: roundGeometry(y),
    w: roundGeometry(Math.max(0.1, Math.min(Math.max(0.1, safeSlide.widthPt - x), Number(box.w || 0)))),
    h: roundGeometry(Math.max(0.1, Math.min(Math.max(0.1, safeSlide.heightPt - y), Number(box.h || 0))))
  };
}

function safeChartType(type) {
  const safe = String(type || "bar").toLowerCase();
  return /^(bar|column)$/.test(safe) ? safe : "bar";
}

function safeIdentifier(value, fallback) {
  const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80);
  return safe || fallback;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value) { return Math.round(Number(value) * 1000) / 1000; }
function roundGeometry(value) { return Math.round(Number(value) * 100) / 100; }
function roundRatio(value) { return Math.round(Number(value) * 10000) / 10000; }
function truncateText(value, maxLength) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength); }

module.exports = {
  sanitizeNativeChart,
  sanitizeNativeCharts,
  sanitizeNativeShape,
  sanitizeNativeShapes
};
