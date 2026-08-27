"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  sanitizeNativeChart,
  sanitizeNativeCharts,
  sanitizeNativeShape,
  sanitizeNativeShapes
} = require("../skills/pd-hifi-slideclone/scripts/lib/native-output-sanitizer");

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

test("native output sanitizer bounds empty, invalid and extreme collections", () => {
  assert.deepEqual(sanitizeNativeShapes(null), []);
  assert.equal(sanitizeNativeShape([]), null);
  assert.deepEqual(sanitizeNativeShapes(Array.from({ length: 20001 }, (_, index) => ({ id: String(index), type: "rect" }))).length, 20000);
  const points = Array.from({ length: 5000 }, (_, index) => ({ x: index, y: index }));
  assert.equal(sanitizeNativeShape({ type: "polyline", points }).points.length, 4096);
  assert.equal(sanitizeNativeChart({ box: { x: 0, y: 0, w: 1, h: 1 }, values: [1] }, 0), null);
});
