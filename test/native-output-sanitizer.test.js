"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  sanitizeNativeChart,
  sanitizeNativeCharts,
  sanitizeNativeShape,
  sanitizeNativeShapes
} = require("../skills/pd-hifi-slideclone/scripts/lib/native-output-sanitizer");

test("legacy output sanitizer forwards to the core boundary", () => {
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/native-output-sanitizer"), require("../packages/slideclone-core/native-output-sanitizer"));
});

test("native output sanitizer preserves safe shapes and bounds absolute freeforms", () => {
  const plain = { id: "shape", type: "rect" };
  assert.equal(sanitizeNativeShape(plain), plain);
  const freeform = sanitizeNativeShape({ type: "freeform", points: [{ x: 950, y: 530 }, { x: 980, y: 560 }] });
  assert.deepEqual(freeform.box, { x: 950, y: 530, w: 10, h: 10 });
  assert.equal(freeform.source.nativePointCoordinateSanitized, true);
});

test("native output sanitizer rejects malformed charts and sanitizes values, labels and style", () => {
  assert.equal(sanitizeNativeChart(null, 0), null);
  assert.deepEqual(sanitizeNativeCharts("bad"), []);
  const charts = sanitizeNativeCharts([{
    id: "unsafe chart!",
    type: "pie",
    box: { x: 10, y: 10, w: 200, h: 120 },
    values: [1, "2", Infinity],
    categories: [" A ", "B", "ignored"],
    style: { fill: "#abcdef", unsafeCss: "url(secret)", fontSizePt: 100 }
  }]);
  assert.equal(charts.length, 1);
  assert.equal(charts[0].id, "unsafe-chart-");
  assert.equal(charts[0].type, "bar");
  assert.deepEqual(charts[0].values, [1, 2]);
  assert.deepEqual(charts[0].categories, ["A", "B"]);
  assert.deepEqual(charts[0].style, { fill: "#ABCDEF", fontSizePt: 40 });
});

test("freeform cleanup still normalizes coordinates after dropping invalid or excess points", () => {
  const input = { type: "freeform", points: [{ x: 100, y: 100 }, { x: NaN, y: 10 }, { x: 200, y: 200 }] };
  const cleaned = sanitizeNativeShape(input);
  assert.deepEqual(cleaned.box, { x: 100, y: 100, w: 100, h: 100 });
  assert.deepEqual(cleaned.points, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.equal(input.points.length, 3);
  const excess = sanitizeNativeShape({ type: "polyline", points: Array.from({ length: 4097 }, (_, i) => ({ x: 100 + i % 2 * 100, y: 100 + i % 2 * 100 })) });
  assert.equal(excess.points.length, 4096);
  assert.deepEqual(excess.box, cleaned.box);
  assert.ok(excess.points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
});

test("relative freeform coercion emits numbers and preserves clean object identity", () => {
  const shape = { type: "freeform", points: [{ x: 0, y: 1 }] };
  assert.equal(sanitizeNativeShape(shape), shape);
  const strings = { type: "freeform", points: [{ x: "0.25", y: "0.75" }] };
  assert.deepEqual(sanitizeNativeShape(strings).points, [{ x: 0.25, y: 0.75 }]);
  assert.equal(strings.points[0].x, "0.25");
  assert.deepEqual(sanitizeNativeShape({ type: "polyline", points: [{ x: Infinity, y: NaN }] }).points, []);
});

test("native output sanitizer bounds empty, invalid and extreme collections", () => {
  assert.deepEqual(sanitizeNativeShapes(null), []);
  assert.equal(sanitizeNativeShape([]), null);
  assert.deepEqual(sanitizeNativeShapes(Array.from({ length: 20001 }, (_, index) => ({ id: String(index), type: "rect" }))).length, 20000);
  const points = Array.from({ length: 5000 }, (_, index) => ({ x: index, y: index }));
  assert.equal(sanitizeNativeShape({ type: "polyline", points }).points.length, 4096);
  assert.equal(sanitizeNativeChart({ box: { x: 0, y: 0, w: 1, h: 1 }, values: [1] }, 0), null);
});

test("chart cleanup preserves category positions across rejected values and multiple series", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  const single = sanitizeNativeChart({ box, categories: ["A", "B", "C"], values: [1, Infinity, 3] }, 0);
  assert.deepEqual(single.values, [1, 3]);
  assert.deepEqual(single.categories, ["A", "C"]);
  const input = { box, categories: ["A", "B", "C"], series: [
    { name: "one", values: [1, Infinity, 3] }, { name: "two", values: [4, 5, 6] }
  ] };
  const multi = sanitizeNativeChart(input, 0);
  assert.deepEqual(multi.categories, ["A", "C"]);
  assert.deepEqual(multi.series.map(series => series.values), [[1, 3], [4, 6]]);
  assert.equal(input.series[0].values[1], Infinity);
  assert.deepEqual(sanitizeNativeChart({ box, categories: ["", "B"], values: [1, 2] }, 0).categories, ["", "B"]);
  assert.equal(sanitizeNativeChart({ box, series: [{ values: [1, Infinity] }, { values: [Infinity, 2] }] }, 0), null);
  const ragged = sanitizeNativeChart({ box, categories: ["A", "B", "C"], series: [{ values: [1, 2] }, { values: [3, 4, 5] }] }, 0);
  assert.deepEqual(ragged.series.map(series => series.values), [[1, 2], [3, 4, 5]]);
  assert.deepEqual(ragged.categories, ["A", "B", "C"]);
  const mixed = sanitizeNativeChart({ box, categories: ["A", "B"], values: [1, 2], series: [{ values: [Infinity, 3] }] }, 0);
  assert.deepEqual(mixed.values, [2]);
  assert.deepEqual(mixed.series[0].values, [3]);
  assert.deepEqual(mixed.categories, ["B"]);
});
