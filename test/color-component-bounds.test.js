"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { detectColorComponents, detectHorizontalColorBands } = require("../skills/pd-hifi-slideclone/scripts/lib/color-component-bounds");

function image(width, height) { return { width, height, rgba: Buffer.alloc(width * height * 4, 255) }; }
function fill(target, box, color) {
  for (let y = box.y; y < box.y + box.h; y += 1) for (let x = box.x; x < box.x + box.w; x += 1) {
    const offset = (y * target.width + x) * 4;
    target.rgba[offset] = color[0]; target.rgba[offset + 1] = color[1]; target.rgba[offset + 2] = color[2]; target.rgba[offset + 3] = 255;
  }
}
const blue = (r, g, b, a) => a > 200 && b > 120 && b - r > 25 && b - g > 5;
const green = (r, g, b, a) => a > 200 && g > 130 && g > r * 1.3 && g > b * 1.1;

test("horizontal color bands ignore inset overlays", () => {
  const source = image(240, 160);
  fill(source, { x: 50, y: 20, w: 130, h: 24 }, [80, 160, 220]);
  fill(source, { x: 150, y: 26, w: 60, h: 12 }, [25, 95, 155]);
  fill(source, { x: 50, y: 80, w: 130, h: 24 }, [60, 140, 205]);
  const bands = detectHorizontalColorBands(source, { predicate: blue, stride: 1, minRowCoverage: 0.4, minBandHeightPx: 10, maxBands: 4 });
  assert.deepEqual(bands, [{ x: 50, y: 20, w: 130, h: 24 }, { x: 50, y: 80, w: 130, h: 24 }]);
});

test("color components return independent minimum units", () => {
  const source = image(120, 80);
  fill(source, { x: 10, y: 10, w: 12, h: 14 }, [40, 185, 90]);
  fill(source, { x: 70, y: 42, w: 16, h: 18 }, [45, 190, 95]);
  const components = detectColorComponents(source, { predicate: green, stride: 1, minAreaPx: 100 });
  assert.deepEqual(components.map(({ areaPx, ...box }) => box), [{ x: 10, y: 10, w: 12, h: 14 }, { x: 70, y: 42, w: 16, h: 18 }]);
});

test("detectors fail closed for malformed images and predicates", () => {
  assert.deepEqual(detectColorComponents({}, { predicate: green }), []);
  assert.deepEqual(detectHorizontalColorBands(image(10, 10), {}), []);
});
