"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectSemanticPieComponents } = require("../skills/pd-hifi-slideclone/scripts/lib/visual-pie-segments");

test("detects bounded color-separated pie sectors and their measured sweeps", () => {
  const { image, components } = pieFixture();
  const segments = detectSemanticPieComponents(image, components, { x: 0, y: 0, w: 320, h: 240 }, "pie chart market share 饼图");

  assert.equal(segments.length, 3);
  assert.ok(segments.every((segment) => segment.kind === "native-pie-segment-candidate"));
  assert.deepEqual(segments.map((segment) => segment.pieParentBox), Array(3).fill({ x: 70, y: 30, w: 181, h: 181 }));
  const sweeps = segments.map((segment) => positiveSweep(segment.pieSegmentAngles)).sort((a, b) => a - b);
  assert.ok(sweeps[0] >= 105 && sweeps[2] <= 130, JSON.stringify(sweeps));
});

test("ignores separated legend swatches outside the shared pie disk", () => {
  const { image, components } = pieFixture();
  components.push({ box: { x: 270, y: 60, w: 18, h: 18 }, pixelCount: 324, color: "#60a5fa", colorSeparated: true });
  const segments = detectSemanticPieComponents(image, components, { x: 0, y: 0, w: 320, h: 240 }, "pie chart");
  assert.equal(segments.length, 3);
});

test("uses complete pixel geometry without semantics and fails closed for malformed inputs", () => {
  const { image, components } = pieFixture();
  assert.equal(detectSemanticPieComponents(image, components, { x: 0, y: 0, w: 320, h: 240 }, "circle decoration").length, 3);
  assert.deepEqual(detectSemanticPieComponents({ width: 10, height: 10, rgba: null }, components, { x: 0, y: 0, w: 320, h: 240 }, "pie chart"), []);
  assert.deepEqual(detectSemanticPieComponents(image, "bad", { x: 0, y: 0, w: 320, h: 240 }, "pie chart"), []);
  assert.deepEqual(detectSemanticPieComponents({ width: 6000, height: 5000, rgba: Buffer.alloc(4) }, components, { x: 0, y: 0, w: 320, h: 240 }, "pie chart"), []);
});

function pieFixture() {
  const image = { width: 320, height: 240, rgba: Buffer.alloc(320 * 240 * 4, 255) };
  const definitions = [
    { start: 0, end: 110, color: "#60a5fa" },
    { start: 110, end: 235, color: "#34d399" },
    { start: 235, end: 360, color: "#f59e0b" }
  ];
  const stats = definitions.map(() => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, pixelCount: 0 }));
  for (let y = 30; y <= 210; y += 1) {
    for (let x = 70; x <= 250; x += 1) {
      if (Math.hypot(x - 160, y - 120) > 90) continue;
      const angle = (Math.atan2(y - 120, x - 160) * 180 / Math.PI + 360) % 360;
      const index = definitions.findIndex((part) => angle >= part.start && angle < part.end);
      setPixel(image, x, y, definitions[index].color);
      const stat = stats[index];
      stat.minX = Math.min(stat.minX, x);
      stat.minY = Math.min(stat.minY, y);
      stat.maxX = Math.max(stat.maxX, x);
      stat.maxY = Math.max(stat.maxY, y);
      stat.pixelCount += 1;
    }
  }
  const components = stats.map((stat, index) => ({
    box: { x: stat.minX, y: stat.minY, w: stat.maxX - stat.minX + 1, h: stat.maxY - stat.minY + 1 },
    pixelCount: stat.pixelCount,
    color: definitions[index].color,
    colorSeparated: true
  }));
  return { image, components };
}

function setPixel(image, x, y, color) {
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(color.slice(1 + offset, 3 + offset), 16));
  const index = (y * image.width + x) * 4;
  image.rgba[index] = rgb[0];
  image.rgba[index + 1] = rgb[1];
  image.rgba[index + 2] = rgb[2];
  image.rgba[index + 3] = 255;
}

function positiveSweep(angles) {
  return ((Number(angles.endDeg) - Number(angles.startDeg)) % 360 + 360) % 360 || 360;
}
