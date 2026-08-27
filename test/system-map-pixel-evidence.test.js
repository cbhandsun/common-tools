"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { measureSystemMapPictorialEnclosure } = require("../skills/pd-hifi-slideclone/scripts/lib/system-map-pixel-evidence");

function image(width = 400, height = 240) { return { width, height, rgba: Buffer.alloc(width * height * 4, 255) }; }
function setPixel(input, x, y, color) { const offset = (y * input.width + x) * 4; input.rgba[offset] = color[0]; input.rgba[offset + 1] = color[1]; input.rgba[offset + 2] = color[2]; input.rgba[offset + 3] = 255; }

test("pictorial enclosure detector recognizes a large saturated green ellipse", () => {
  const input = image();
  for (let index = 0; index < 720; index += 1) {
    const angle = Math.PI * 2 * index / 720;
    const x = Math.round(input.width * (0.5 + 0.18 * Math.cos(angle)));
    const y = Math.round(input.height * (0.4 + 0.36 * Math.sin(angle)));
    for (let delta = -2; delta <= 2; delta += 1) setPixel(input, Math.max(0, Math.min(input.width - 1, x + delta)), Math.max(0, Math.min(input.height - 1, y)), [45, 190, 110]);
  }
  const result = measureSystemMapPictorialEnclosure(input, { x: 0, y: 0, w: 400, h: 240 }, { widthPt: 400, heightPt: 240 }, (box) => box);
  assert.equal(result.detected, true);
  assert.ok(result.confidence >= 0.22);
});

test("pictorial enclosure detector rejects sparse mapping lines and invalid inputs", () => {
  const input = image();
  for (let x = 20; x < 380; x += 1) setPixel(input, x, 120, [45, 190, 110]);
  assert.equal(measureSystemMapPictorialEnclosure(input, { x: 0, y: 0, w: 400, h: 240 }, { widthPt: 400, heightPt: 240 }, (box) => box).detected, false);
  assert.deepEqual(measureSystemMapPictorialEnclosure(null, {}, {}, () => ({})), { detected: false, confidence: 0, sampledEllipses: 0 });
  assert.throws(() => measureSystemMapPictorialEnclosure(input, { x: 0, y: 0, w: 400, h: 240 }, {}, null), /projectBox/);
});
