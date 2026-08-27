"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  dominantBorderColor,
  makeEdgeConnectedBackgroundTransparent
} = require("../skills/pd-hifi-slideclone/scripts/lib/edge-background-alpha");

function image(width, height, color = [248, 251, 252, 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba.set(color, pixel * 4);
  }
  return { width, height, rgba };
}

function setPixel(value, x, y, color) {
  value.rgba.set(color, (y * value.width + x) * 4);
}

function alphaAt(value, x, y) {
  return value.rgba[(y * value.width + x) * 4 + 3];
}

test("edge background transparency removes connected border without erasing enclosed pale icon fill", () => {
  const input = image(9, 9);
  for (let y = 2; y <= 6; y += 1) {
    for (let x = 2; x <= 6; x += 1) setPixel(input, x, y, [20, 150, 90, 255]);
  }
  for (let y = 3; y <= 5; y += 1) {
    for (let x = 3; x <= 5; x += 1) setPixel(input, x, y, [248, 251, 252, 255]);
  }

  const output = makeEdgeConnectedBackgroundTransparent(input);

  assert.equal(alphaAt(output, 0, 0), 0);
  assert.equal(alphaAt(output, 4, 4), 255);
  assert.equal(alphaAt(output, 2, 2), 255);
});

test("dominant border color ignores a minority colored edge crossing", () => {
  const input = image(12, 8);
  for (let x = 0; x < 3; x += 1) setPixel(input, x, 7, [160, 170, 180, 255]);

  const color = dominantBorderColor(input);

  assert.ok(color.r > 240 && color.g > 240 && color.b > 240);
});

test("edge background transparency rejects malformed image input", () => {
  assert.throws(() => makeEdgeConnectedBackgroundTransparent({ width: 1, height: 1, rgba: Buffer.alloc(3) }), /RGBA/);
});
