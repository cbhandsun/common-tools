// @ts-check
"use strict";

/** @typedef {Record<string, unknown>} UnknownRecord */
/** @typedef {{ widthPt: number, heightPt: number }} SlideSize */
/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ name: string, values: number[] }} ChartSeries */
/** @typedef {{ id: string, type: string, box: Box, style: UnknownRecord, categories: string[], values?: number[], series?: ChartSeries[], source: UnknownRecord }} NativeChart */

/** @type {Readonly<SlideSize>} */
const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });
const MAX_SHAPES = 20000;
const MAX_FREEFORM_POINTS = 4096;

/** @param {unknown} charts @param {SlideSize} [slideSize] @returns {NativeChart[]} */
function sanitizeNativeCharts(charts, slideSize = DEFAULT_SLIDE) {
  if (!Array.isArray(charts)) return [];
  const safeCharts = [];
  for (const chart of charts.slice(0, 12)) {
    const safe = sanitizeNativeChart(chart, safeCharts.length, slideSize);
    if (safe) safeCharts.push(safe);
  }
  return safeCharts;
}

/** @param {unknown} shapes @param {SlideSize} [slideSize] @returns {UnknownRecord[]} */
function sanitizeNativeShapes(shapes = [], slideSize = DEFAULT_SLIDE) {
  if (!Array.isArray(shapes)) return [];
  return shapes.slice(0, MAX_SHAPES)
    .map((shape) => sanitizeNativeShape(shape, slideSize))
    .filter((shape) => shape !== null);
}

/** @param {unknown} shape @param {SlideSize} [slideSize] @returns {UnknownRecord | null} */
function sanitizeNativeShape(shape, slideSize = DEFAULT_SLIDE) {
  if (!isRecord(shape)) return null;
  const type = String(shape.type || "").toLowerCase();
  if (type !== "freeform" && type !== "polyline") return shape;
  const points = Array.isArray(shape.points) ? shape.points.slice(0, MAX_FREEFORM_POINTS) : [];
  if (points.length === 0) return shape;
  const numericPoints = points
    .map((point) => {
      /** @type {{ x?: unknown, y?: unknown } | null | undefined} */
      const input = /** @type {{ x?: unknown, y?: unknown } | null | undefined} */ (point);
      return { x: Number(input?.x), y: Number(input?.y) };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const changed = numericPoints.length !== points.length || points.length !== (Array.isArray(shape.points) ? shape.points.length : 0)
    || points.some((point) => {
      /** @type {{ x?: unknown, y?: unknown } | null | undefined} */
      const input = /** @type {{ x?: unknown, y?: unknown } | null | undefined} */ (point);
      return typeof input?.x !== "number" || typeof input?.y !== "number";
    });
  if (numericPoints.length === 0) return { ...shape, points: [] };
  const alreadyRelative = numericPoints.every((point) =>
    point.x >= -0.001 && point.x <= 1.001 && point.y >= -0.001 && point.y <= 1.001
  );
  if (alreadyRelative) return changed ? { ...shape, points: numericPoints } : shape;
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
    source: { ...asObject(shape.source || {}), nativePointCoordinateSanitized: true }
  };
}

/** @param {unknown} chart @param {number} fallbackIndex @param {SlideSize} [slideSize] @returns {NativeChart | null} */
function sanitizeNativeChart(chart, fallbackIndex, slideSize = DEFAULT_SLIDE) {
  if (!isRecord(chart)) return null;
  const box = sanitizeBox(chart.box, slideSize);
  if (!box) return null;
  const { values, series, categories } = sanitizeChartData(chart);
  if (values.length === 0 && series.length === 0) return null;
  const valueCount = values.length || Math.max(...series.map((item) => item.values.length), 0);
  if (valueCount <= 0) return null;
  return {
    id: safeIdentifier(chart.id, `native-chart-${fallbackIndex + 1}`),
    type: safeChartType(chart.type),
    box,
    style: sanitizeChartStyle(chart.style),
    categories,
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

/** @param {unknown} box @param {SlideSize} [slideSize] @returns {Box | null} */
function sanitizeBox(box, slideSize = DEFAULT_SLIDE) {
  if (!isRecord(box)) return null;
  const x = finiteNumber(box.x);
  const y = finiteNumber(box.y);
  const w = finiteNumber(box.w);
  const h = finiteNumber(box.h);
  if ([x, y, w, h].some((value) => value === null) || w === null || h === null || w < 8 || h < 8 || x === null || y === null) return null;
  const safeSlide = normalizeSlideSize(slideSize);
  if (x < -safeSlide.widthPt || y < -safeSlide.heightPt || x > safeSlide.widthPt * 2 || y > safeSlide.heightPt * 2) return null;
  return { x: roundNumber(Math.max(0, Math.min(safeSlide.widthPt, x))), y: roundNumber(Math.max(0, Math.min(safeSlide.heightPt, y))), w: roundNumber(Math.min(safeSlide.widthPt, w)), h: roundNumber(Math.min(safeSlide.heightPt, h)) };
}

/** @param {UnknownRecord} chart @returns {{ values: number[], series: ChartSeries[], categories: string[] }} */
function sanitizeChartData(chart) {
  /** @param {unknown} values @returns {(number | null)[]} */
  const parseValues = (values) => Array.isArray(values) ? values.slice(0, 24).map(finiteNumber) : [];
  const parsedValues = parseValues(chart.values);
  const rawValues = parsedValues.some((value) => value !== null) ? parsedValues : [];
  const rawSeries = (Array.isArray(chart.series) ? chart.series : []).slice(0, 6).map((item, index) => {
    if (!isRecord(item)) return null;
    const values = parseValues(item.values);
    return values.some((value) => value !== null) ? { name: truncateText(item.name || `Series ${index + 1}`, 80), values } : null;
  }).filter((item) => item !== null);
  const vectors = [rawValues, ...rawSeries.map((item) => item.values)];
  const length = Math.max(...vectors.map((values) => values.length));
  const indices = Array.from({ length }, (_, index) => index).filter((index) => vectors.every((values) => index >= values.length || values[index] !== null));
  /** @param {(number | null)[]} values @returns {number[]} */
  const select = (values) => indices.filter((index) => index < values.length).map((index) => roundNumber(/** @type {number} */ (values[index])));
  const chartCategories = chart.categories;
  return {
    values: select(rawValues),
    series: rawSeries.map((item) => ({ name: item.name, values: select(item.values) })).filter((item) => item.values.length),
    categories: Array.isArray(chartCategories) ? indices.filter((index) => index < chartCategories.length).map((index) => truncateText(chartCategories[index], 80)) : []
  };
}

/** @param {unknown} style @returns {UnknownRecord} */
function sanitizeChartStyle(style) {
  if (!isRecord(style)) return {};
  /** @type {UnknownRecord} */
  const safe = {};
  for (const key of ["fill", "stroke", "barFill", "accent", "axisColor", "textColor"]) {
    if (typeof style[key] === "string" && /^#[0-9a-fA-F]{6}$/.test(style[key])) safe[key] = style[key].toUpperCase();
  }
  if (typeof style.fontFamily === "string") safe.fontFamily = truncateText(style.fontFamily, 80);
  const fontSizePt = finiteNumber(style.fontSizePt);
  if (fontSizePt !== null) safe.fontSizePt = roundNumber(Math.max(4, Math.min(40, fontSizePt)));
  return safe;
}

/** @param {unknown} slideSize @returns {SlideSize} */
function normalizeSlideSize(slideSize) {
  /** @type {{ widthPt?: unknown, heightPt?: unknown }} */
  const size = /** @type {{ widthPt?: unknown, heightPt?: unknown }} */ (slideSize);
  const widthPt = finiteNumber(slideSize == null ? undefined : size.widthPt);
  const heightPt = finiteNumber(slideSize == null ? undefined : size.heightPt);
  return { widthPt: widthPt !== null && widthPt >= 100 && widthPt <= 10000 ? widthPt : DEFAULT_SLIDE.widthPt, heightPt: heightPt !== null && heightPt >= 100 && heightPt <= 10000 ? heightPt : DEFAULT_SLIDE.heightPt };
}

/** @param {Point[]} points @returns {Box} */
function freeformBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** @param {Box} box @param {unknown} slideSize @returns {Box} */
function clampPtBoxToSlide(box, slideSize) {
  const safeSlide = normalizeSlideSize(slideSize);
  const x = Math.max(0, Math.min(safeSlide.widthPt, Number(box.x || 0)));
  const y = Math.max(0, Math.min(safeSlide.heightPt, Number(box.y || 0)));
  return { x: roundGeometry(x), y: roundGeometry(y), w: roundGeometry(Math.max(0.1, Math.min(Math.max(0.1, safeSlide.widthPt - x), Number(box.w || 0)))), h: roundGeometry(Math.max(0.1, Math.min(Math.max(0.1, safeSlide.heightPt - y), Number(box.h || 0)))) };
}

/** @param {unknown} type @returns {string} */
function safeChartType(type) { const safe = String(type || "bar").toLowerCase(); return /^(bar|column)$/.test(safe) ? safe : "bar"; }
/** @param {unknown} value @param {string} fallback @returns {string} */
function safeIdentifier(value, fallback) { const safe = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 80); return safe || fallback; }
/** @param {unknown} value @returns {number | null} */
function finiteNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
/** @param {number} value @returns {number} */
function roundNumber(value) { return Math.round(Number(value) * 1000) / 1000; }
/** @param {number} value @returns {number} */
function roundGeometry(value) { return Math.round(Number(value) * 100) / 100; }
/** @param {number} value @returns {number} */
function roundRatio(value) { return Math.round(Number(value) * 10000) / 10000; }
/** @param {unknown} value @param {number} maxLength @returns {string} */
function truncateText(value, maxLength) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength); }
/** @param {unknown} value @returns {value is UnknownRecord} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {object} */
function asObject(value) { return /** @type {object} */ (value); }

module.exports = { sanitizeNativeChart, sanitizeNativeCharts, sanitizeNativeShape, sanitizeNativeShapes };
