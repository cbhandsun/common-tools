"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { traceNativeMaskContours } = require("../packages/slideclone-core/scene-plan/native-mask-contours");

test("contour indexing preserves frozen paths and work counts for every small occupancy mask", () => {
  // Captured from the original coordinate-string implementation. This covers
  // every nonempty 3x3 topology, holes, diagonals, and different start orders.
  const hash = createHash("sha256");
  for (let mask = 1; mask < 512; mask++) {
    const points = [];
    for (let n = 0; n < 9; n++) if (mask & (1 << n)) points.push({ x: n % 3, y: Math.floor(n / 3) });
    for (const reverse of [false, true]) for (const outerOnly of [false, true]) {
      const workState = { checks: 0, exhausted: false };
      const output = traceNativeMaskContours(reverse ? points.slice().reverse() : points,
        { x: 0, y: 0, w: 3, h: 3 }, { outerOnly, workState });
      hash.update(JSON.stringify({ output, workState }));
    }
  }
  assert.equal(hash.digest("hex"), "9e4d9dd3e11270817ed759b269c395d2d75c248fbcaaea266e4eaa0b89fd6830");
});

test("contour indexing never joins opposite row edges and preserves duplicate insertion order", () => {
  const points = [{ x: 3, y: 0 }, { x: 0, y: 1 }], box = { x: 0, y: 0, w: 4, h: 2 };
  const expected = traceNativeMaskContours(points, box, { tolerancePx: 0 });
  assert.equal(expected.filter(segment => segment.type === "close").length, 2);
  assert.deepEqual(traceNativeMaskContours([points[0], points[0], points[1], points[0]], box,
    { tolerancePx: 0 }), expected);
  const singleton = traceNativeMaskContours([{ x: 0, y: 0 }], { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(singleton.length, 5);
});

test("contour indices remain local at the safe-coordinate and original area limits", () => {
  const points = [{ x: 1, y: 0 }, { x: 0, y: 1 }], box = { x: 0, y: 0, w: 2, h: 2 };
  const expected = traceNativeMaskContours(points, box, { tolerancePx: 0 });
  for (const offset of [2 ** 32, Number.MAX_SAFE_INTEGER - 2]) {
    assert.deepEqual(traceNativeMaskContours(points.map(p => ({ x: p.x + offset, y: p.y })),
      { ...box, x: offset }, { tolerancePx: 0 }), expected);
  }
  assert.ok(traceNativeMaskContours([{ x: 999999, y: 0 }], { x: 0, y: 0, w: 1000000, h: 1 }));
  assert.throws(() => traceNativeMaskContours([{ x: 0, y: 0 }], { x: 0, y: 0, w: 1000001, h: 1 }), TypeError);
});

test("indexing keeps the original validation and exhausted-work rejection", () => {
  const box = { x: 0, y: 0, w: 4, h: 4 };
  for (const points of [[], [{ x: -1, y: 1 }], [{ x: 4, y: 0 }], [{ x: 0, y: Infinity }], [{ x: 0.5, y: 0 }]]) {
    assert.throws(() => traceNativeMaskContours(points, box), TypeError);
  }
  const state = { checks: 4000000, exhausted: false };
  assert.equal(traceNativeMaskContours([{ x: 1, y: 1 }], box, { workState: state }), null);
  assert.deepEqual(state, { checks: 4000000, exhausted: false });
  let reads = 0;
  const hostile = { get checks() { reads++; throw new Error("sensitive-test-content"); }, exhausted: false };
  assert.throws(() => traceNativeMaskContours([{ x: 1, y: 1 }], box, { workState: hostile }), { message: "Invalid native contour work state" });
  assert.equal(reads, 0);
});
