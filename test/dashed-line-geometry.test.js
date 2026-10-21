"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fitDashedLineGeometry } = require("../packages/slideclone-core/dashed-line-geometry");

function fixture(sign = 1) {
  const points = [];
  for (let x = 20; x <= 120; x++) {
    if (Math.floor((x - 20) / 10) % 2) continue;
    const y = sign === 1 ? x / 2 + 20 : 100 - x / 2;
    for (let dy = -2; dy <= 2; dy++) points.push({ x, y: y + dy });
  }
  return { bounds: { minX: 0, minY: 0, w: 160, h: 120 }, points };
}

test("dashed-line fit follows observed slope and asymmetric endpoints rather than bounding-box corners", () => {
  for (const sign of [-1, 1]) {
    const evidence = fixture(sign);
    const vote = { slope: sign * 0.5 * 159 / 119, intercept: (sign === 1 ? 20 : 100) / 119 };
    const result = fitDashedLineGeometry(evidence, vote);
    assert.ok(result);
    assert.ok(result.x1 > 19 && result.x1 < 25);
    assert.ok(result.x2 > 115 && result.x2 < 121);
    assert.ok(Math.abs((result.y2 - result.y1) / (result.x2 - result.x1) - sign * 0.5) < 0.01);
    assert.ok(result.thickness >= 3 && result.thickness <= 6);
  }
});

test("dashed-line fit rejects empty, malformed, extreme and unmatched evidence", () => {
  const evidence = fixture();
  const vote = { slope: 0.5 * 159 / 119, intercept: 20 / 119 };
  for (const input of [null, {}, { ...evidence, points: [] }, { ...evidence, points: Array(262145).fill({ x: 1, y: 1 }) },
    { ...evidence, points: [...evidence.points, { x: NaN, y: 2 }] },
    { ...evidence, points: [...evidence.points, { x: 5000, y: 2 }] },
    { ...evidence, bounds: { ...evidence.bounds, w: Infinity } }]) assert.equal(fitDashedLineGeometry(input, vote), null);
  for (const input of [null, {}, { ...vote, slope: "0.5" }, { ...vote, intercept: Infinity },
    { ...vote, slope: 0 }, { ...vote, slope: 100 }, { ...vote, intercept: 3 }]) assert.equal(fitDashedLineGeometry(evidence, input), null);
});
