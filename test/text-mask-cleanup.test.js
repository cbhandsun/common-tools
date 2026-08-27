"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { eraseDarkPixelsInRects } = require("../skills/pd-hifi-slideclone/scripts/lib/text-mask-cleanup");

test("text mask cleanup removes dark text pixels but preserves light diagram strokes", () => {
  const image = makeImage(3, 1, [
    [20, 20, 20, 255],
    [175, 180, 185, 255],
    [255, 255, 255, 255]
  ]);
  const result = eraseDarkPixelsInRects(image, [{ x: 0, y: 0, w: 3, h: 1 }], { maxLuma: 110 });

  assert.equal(result.erasedPixels, 1);
  assert.deepEqual(pixel(result.image, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixel(result.image, 1, 0), [175, 180, 185, 255]);
  assert.deepEqual(pixel(result.image, 2, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixel(image, 0, 0), [20, 20, 20, 255]);
});

test("text mask cleanup clamps hostile rectangles and safely ignores invalid input", () => {
  const image = makeImage(2, 2, Array(4).fill([0, 0, 0, 255]));
  const result = eraseDarkPixelsInRects(image, [{ x: -1e9, y: -1e9, w: 2e9, h: 2e9 }]);

  assert.equal(result.erasedPixels, 4);
  assert.equal(eraseDarkPixelsInRects(null, [{}]).erasedPixels, 0);
  assert.equal(eraseDarkPixelsInRects(image, "bad").erasedPixels, 0);
});

function makeImage(width, height, colors) {
  const rgba = Buffer.alloc(width * height * 4);
  colors.forEach((color, index) => color.forEach((value, channel) => {
    rgba[index * 4 + channel] = value;
  }));
  return { width, height, rgba };
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [...image.rgba.subarray(offset, offset + 4)];
}
