"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSemanticQuadrantPanels } = require("../skills/pd-hifi-slideclone/scripts/lib/visual-quadrant-panels");

test("detects exactly four complete quadrant panels", () => {
  const panels = detectSemanticQuadrantPanels(fixture(), { x: 0, y: 0, w: 520, h: 360 }, "impact effort quadrant matrix 四象限");
  assert.equal(panels.length, 4);
  assert.deepEqual(panels.map((panel) => [panel.quadrantRow, panel.quadrantColumn]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  assert.ok(panels.every((panel) => panel.kind === "native-quadrant-panel-candidate"));
});

test("rejects incomplete and irregular panel layouts", () => {
  assert.deepEqual(detectSemanticQuadrantPanels(fixture().slice(0, 3), { x: 0, y: 0, w: 520, h: 360 }, "quadrant"), []);
  const irregular = fixture();
  irregular[3] = panel({ x: 220, y: 220, w: 112, h: 56 }, "#dbeafe");
  assert.deepEqual(detectSemanticQuadrantPanels(irregular, { x: 0, y: 0, w: 520, h: 360 }, "quadrant"), []);
});

test("fails closed for malformed, excessive, and unrelated inputs", () => {
  assert.deepEqual(detectSemanticQuadrantPanels("bad", { x: 0, y: 0, w: 520, h: 360 }, "quadrant"), []);
  assert.deepEqual(detectSemanticQuadrantPanels(Array(97).fill(fixture()[0]), { x: 0, y: 0, w: 520, h: 360 }, "quadrant"), []);
  assert.deepEqual(detectSemanticQuadrantPanels(fixture(), { x: 0, y: 0, w: 520, h: 360 }, "decorative cards"), []);
});

function fixture() {
  return [
    panel({ x: 96, y: 82, w: 112, h: 56 }, "#dbeafe"),
    panel({ x: 312, y: 82, w: 112, h: 56 }, "#bfdbfe"),
    panel({ x: 96, y: 220, w: 112, h: 56 }, "#bfdbfe"),
    panel({ x: 312, y: 220, w: 112, h: 56 }, "#dbeafe")
  ];
}

function panel(box, color) {
  return { box, pixelCount: box.w * box.h, color, colorSeparated: true };
}
