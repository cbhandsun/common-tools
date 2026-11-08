"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { traceSparseConnectorContours, estimateSparseConnectorInkColor } = require("../packages/slideclone-core/routing/sparse-connector-contours");

test("sparse connector color uses the saturated ink core rather than the majority antialias halo", () => {
  const core = { r: 20, g: 80, b: 230 };
  const colors = [...Array.from({ length: 70 }, () => ({ r: 210, g: 225, b: 250 })), ...Array.from({ length: 30 }, () => ({ ...core }))];
  const before = structuredClone(colors);
  assert.deepEqual(estimateSparseConnectorInkColor(colors), core);
  assert.deepEqual(colors, before);
  assert.equal(estimateSparseConnectorInkColor([]), null);
  for (const value of [null, [{ r: NaN, g: 0, b: 0 }], [{ r: -1, g: 0, b: 0 }], [{ r: "private", g: 0, b: 0 }]]) {
    assert.throws(() => estimateSparseConnectorInkColor(value), error => !error.message.includes("private"));
  }
});

test("sparse connector contours preserve bends and arrowheads in one bounded native path", () => {
  const points = [];
  for (let x = 0; x < 90; x++) {
    const y = Math.round(4 + x * x / 180);
    for (let dy = 0; dy < 3; dy++) points.push({ x, y: y + dy });
  }
  for (let y = 40; y < 58; y++) for (let x = 85; x < 100 - (y - 40); x++) points.push({ x, y });
  const result = traceSparseConnectorContours(points, { x: 0, y: 0, w: 100, h: 60 });
  assert.ok(result);
  assert.ok(result.segments.length <= 120);
  assert.equal(result.segments.at(-1).type, "close");
  assert.ok(result.segments.flatMap(segment => segment.points).some(point => point.x >= 0.99));
  assert.ok(result.tolerancePx <= 1);
  assert.ok(result.pixelCount <= points.length);
});

test("sparse connector contours reject dense fills, empty evidence and path fragmentation", () => {
  const box = { x: 0, y: 0, w: 100, h: 100 };
  assert.equal(traceSparseConnectorContours([], box), null);
  const dense = Array.from({ length: 10000 }, (_, index) => ({ x: index % 100, y: Math.floor(index / 100) }));
  assert.equal(traceSparseConnectorContours(dense, box), null);
  const disconnected = dense.filter(point => point.x % 4 === 0 && point.y % 4 === 0);
  assert.equal(traceSparseConnectorContours(disconnected, box), null);
});

test("sparse connector contours validate extreme and unsafe inputs without echoing content", () => {
  for (const [points, box] of [
    [null, { x: 0, y: 0, w: 10, h: 10 }],
    [[], { x: 0, y: 0, w: 1001, h: 1000 }],
    [[], { x: -1, y: 0, w: 10, h: 10 }],
    [[{ x: 10, y: 0 }], { x: 0, y: 0, w: 10, h: 10 }],
    [[{ x: "secret", y: 0 }], { x: 0, y: 0, w: 10, h: 10 }],
    [[{ x: Infinity, y: 0 }], { x: 0, y: 0, w: 10, h: 10 }]
  ]) assert.throws(() => traceSparseConnectorContours(points, box), error => !error.message.includes("secret"));
});
