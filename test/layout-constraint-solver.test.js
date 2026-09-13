"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  alignBoxes,
  assertBox,
  computeEnvelope,
  distributeBoxes,
  snapBox,
  solveGridLayout
} = require("../packages/slideclone-core/layout-constraint-solver");

test("assertBox validates and extracts coordinate bounding boxes", () => {
  assert.deepEqual(assertBox({ x: 10, y: 20, w: 100, h: 50 }), { x: 10, y: 20, w: 100, h: 50 });
  assert.deepEqual(assertBox({ x: "10", y: "20", w: "100", h: "50" }), { x: 10, y: 20, w: 100, h: 50 });

  assert.throws(() => assertBox(null), /must be an object/);
  assert.throws(() => assertBox([]), /must be an object/);
  assert.throws(() => assertBox({ x: null, y: 0, w: 10, h: 10 }), /finite numbers/);
  assert.throws(() => assertBox({ x: "", y: 0, w: 10, h: 10 }), /finite numbers/);
  assert.throws(() => assertBox({ x: NaN, y: 0, w: 10, h: 10 }), /finite numbers/);
  assert.throws(() => assertBox({ x: 0, y: 0, w: -5, h: 10 }), /non-negative/);
});

test("computeEnvelope calculates bounding box enclosing all input boxes", () => {
  assert.throws(() => computeEnvelope([]), /non-empty array/);
  assert.throws(() => computeEnvelope(null), /non-empty array/);

  const single = computeEnvelope([{ x: 50, y: 50, w: 100, h: 100 }]);
  assert.deepEqual(single, { x: 50, y: 50, w: 100, h: 100 });

  const multiple = computeEnvelope([
    { x: 10, y: 20, w: 30, h: 40 }, // x: 10..40, y: 20..60
    { x: 50, y: 10, w: 20, h: 80 }  // x: 50..70, y: 10..90
  ]);
  assert.deepEqual(multiple, { x: 10, y: 10, w: 60, h: 80 });
});

test("alignBoxes aligns boxes across left, center, right, top, middle, bottom", () => {
  const boxes = [
    { x: 10, y: 20, w: 40, h: 20 },
    { x: 20, y: 50, w: 60, h: 30 }
  ];

  // Auto reference envelope: x: 10..80 (w: 70), y: 20..80 (h: 60)
  const leftAligned = alignBoxes(boxes, "left");
  assert.equal(leftAligned[0].x, 10);
  assert.equal(leftAligned[1].x, 10);

  const rightAligned = alignBoxes(boxes, "right");
  assert.equal(rightAligned[0].x, 80 - 40); // 40
  assert.equal(rightAligned[1].x, 80 - 60); // 20

  const topAligned = alignBoxes(boxes, "top");
  assert.equal(topAligned[0].y, 20);
  assert.equal(topAligned[1].y, 20);

  const middleAligned = alignBoxes(boxes, "middle");
  // ref.y = 20, ref.h = 60 => center = 50
  assert.equal(middleAligned[0].y, 20 + (60 - 20) / 2); // 40
  assert.equal(middleAligned[1].y, 20 + (60 - 30) / 2); // 35

  // Align with explicit referenceBox
  const ref = { x: 0, y: 0, w: 200, h: 100 };
  const centerAligned = alignBoxes(boxes, "center", ref);
  assert.equal(centerAligned[0].x, (200 - 40) / 2); // 80
  assert.equal(centerAligned[1].x, (200 - 60) / 2); // 70

  assert.throws(() => alignBoxes(boxes, "diagonal"), /invalid alignment mode/);
  assert.throws(() => alignBoxes(boxes, "diagonal private-token"), (error) => {
    assert.match(error.message, /invalid alignment mode/);
    assert.equal(error.message.includes("private-token"), false);
    return true;
  });
});

test("distributeBoxes evenly spaces boxes along horizontal and vertical axes", () => {
  const boxes = [
    { x: 0, y: 0, w: 20, h: 10 },
    { x: 0, y: 0, w: 20, h: 10 },
    { x: 0, y: 0, w: 20, h: 10 }
  ];

  // Total items width = 60, container w = 100 -> available = 40, 2 gaps -> 20 each
  const container = { x: 0, y: 0, w: 100, h: 50 };
  const hDistributed = distributeBoxes(boxes, "horizontal", { bounds: container });
  assert.equal(hDistributed[0].x, 0);
  assert.equal(hDistributed[1].x, 40); // 0 + 20 + 20
  assert.equal(hDistributed[2].x, 80); // 40 + 20 + 20

  // Fixed gap
  const fixedGap = distributeBoxes(boxes, "horizontal", { bounds: container, gap: 10 });
  assert.equal(fixedGap[0].x, 0);
  assert.equal(fixedGap[1].x, 30); // 0 + 20 + 10
  assert.equal(fixedGap[2].x, 60); // 30 + 20 + 10

  // Single box distribution
  const single = distributeBoxes([boxes[0]], "horizontal");
  assert.deepEqual(single, [boxes[0]]);

  assert.throws(() => distributeBoxes(boxes, "invalid"), /invalid distribution axis/);
  assert.throws(() => distributeBoxes(boxes, "invalid private-token"), (error) => {
    assert.match(error.message, /invalid distribution axis/);
    assert.equal(error.message.includes("private-token"), false);
    return true;
  });
  assert.throws(() => distributeBoxes(boxes, "horizontal", []), /options must be an object/);
  assert.throws(() => distributeBoxes(boxes, "horizontal", { gap: -1 }), /non-negative finite number/);
  assert.throws(() => distributeBoxes(boxes, "horizontal", { gap: "bad" }), /non-negative finite number/);
});

test("solveGridLayout computes responsive grid cells", () => {
  const container = { x: 0, y: 0, w: 200, h: 100 };

  // 4 items in 2x2
  const grid4 = solveGridLayout(container, 4, { cols: 2 });
  assert.equal(grid4.length, 4);
  assert.deepEqual(grid4[0], { index: 0, row: 0, col: 0, x: 0, y: 0, w: 100, h: 50 });
  assert.deepEqual(grid4[1], { index: 1, row: 0, col: 1, x: 100, y: 0, w: 100, h: 50 });
  assert.deepEqual(grid4[2], { index: 2, row: 1, col: 0, x: 0, y: 50, w: 100, h: 50 });
  assert.deepEqual(grid4[3], { index: 3, row: 1, col: 1, x: 100, y: 50, w: 100, h: 50 });

  // Grid with gaps
  const gridWithGaps = solveGridLayout(container, 2, { cols: 2, gapX: 20 });
  // w = 200 - 20 = 180, cellW = 90
  assert.equal(gridWithGaps[0].w, 90);
  assert.equal(gridWithGaps[1].x, 110);

  // Invalid inputs
  assert.throws(() => solveGridLayout(container, 0), /must be an integer between 1 and 500/);
  assert.throws(() => solveGridLayout(container, -1), /must be an integer between 1 and 500/);
  assert.throws(() => solveGridLayout(container, 1000), /must be an integer between 1 and 500/);
  assert.throws(() => solveGridLayout(container, 4, []), /options must be an object/);
  assert.throws(() => solveGridLayout(container, 4, { cols: 1.5 }), /grid cols must be a positive integer/);
  assert.throws(() => solveGridLayout(container, 4, { cols: 1, rows: 1 }), /grid rows and cols must fit count/);
  assert.throws(() => solveGridLayout(container, 4, { gapX: "bad" }), /gapX must be a non-negative finite number/);
  assert.throws(() => solveGridLayout(container, 4, { cols: 2, gapX: 300 }), /grid horizontal gaps must fit container width/);
  assert.throws(() => solveGridLayout(container, 4, { rows: 2, gapY: 200 }), /grid vertical gaps must fit container height/);
});

test("snapBox aligns coordinates to discrete grid sizes", () => {
  const box = { x: 11.2, y: 23.8, w: 99.1, h: 50.4 };
  const snapped10 = snapBox(box, 10);
  assert.deepEqual(snapped10, { x: 10, y: 20, w: 100, h: 50 });

  const snapped5 = snapBox(box, 5);
  assert.deepEqual(snapped5, { x: 10, y: 25, w: 100, h: 50 });

  assert.throws(() => snapBox(box, 0), /gridSize must be a positive number/);
  assert.throws(() => snapBox(box, -2), /gridSize must be a positive number/);
});
