"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSemanticConcentricCircles } = require("../skills/pd-hifi-slideclone/scripts/lib/visual-concentric-circles");

test("detects ordered concentric color layers without retaining fragments", () => {
  const components = [
    layer({ x: 40, y: 20, w: 220, h: 220 }, 18900, "#dbeafe"),
    layer({ x: 76, y: 56, w: 148, h: 148 }, 10800, "#bfdbfe"),
    layer({ x: 104, y: 84, w: 92, h: 92 }, 6600, "#60a5fa"),
    layer({ x: 12, y: 12, w: 14, h: 14 }, 196, "#94a3b8")
  ];
  const circles = detectSemanticConcentricCircles(components, { x: 0, y: 0, w: 300, h: 260 }, "concentric circles onion diagram 同心圆");

  assert.equal(circles.length, 3);
  assert.deepEqual(circles.map((circle) => circle.box.w), [220, 148, 92]);
  assert.deepEqual(circles.map((circle) => circle.concentricLayerIndex), [0, 1, 2]);
});

test("rejects offset circles and non-concentric semantics", () => {
  const offset = [
    layer({ x: 40, y: 20, w: 220, h: 220 }, 18900, "#dbeafe"),
    layer({ x: 130, y: 56, w: 148, h: 148 }, 10800, "#bfdbfe")
  ];
  assert.deepEqual(detectSemanticConcentricCircles(offset, { x: 0, y: 0, w: 300, h: 260 }, "concentric circles"), []);
  assert.deepEqual(detectSemanticConcentricCircles(offset, { x: 0, y: 0, w: 300, h: 260 }, "decorative bubbles"), []);
});

test("fails closed for empty, malformed, and excessive component input", () => {
  assert.deepEqual(detectSemanticConcentricCircles([], { x: 0, y: 0, w: 300, h: 260 }, "onion diagram"), []);
  assert.deepEqual(detectSemanticConcentricCircles("bad", { x: 0, y: 0, w: 300, h: 260 }, "onion diagram"), []);
  assert.deepEqual(detectSemanticConcentricCircles(Array(97).fill(layer({ x: 1, y: 1, w: 20, h: 20 }, 200, "#dbeafe")), { x: 0, y: 0, w: 300, h: 260 }, "onion diagram"), []);
  assert.deepEqual(detectSemanticConcentricCircles([layer({ x: 1, y: 1, w: Number.NaN, h: 20 }, 200, "#dbeafe")], { x: 0, y: 0, w: 300, h: 260 }, "onion diagram"), []);
});

function layer(box, pixelCount, color) {
  return { box, pixelCount, color, colorSeparated: true };
}
