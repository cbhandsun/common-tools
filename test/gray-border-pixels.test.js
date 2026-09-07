"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanGrayBorderPixels } = require("../packages/slideclone-core/gray-border-pixels");

function image(width = 80, height = 60, color = [255, 255, 255, 255]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(color, offset);
  return { width, height, rgba };
}
function setPixel(target, x, y, color) { target.rgba.set(color, (y * target.width + x) * 4); }
function getPixel(target, x, y) { return Array.from(target.rgba.subarray((y * target.width + x) * 4, (y * target.width + x + 1) * 4)); }
function request(sourceImage, layerImage, borders, layerBox = { x: 0, y: 0, w: sourceImage.width, h: sourceImage.height }) {
  return { sourceImage, layerImage, layerBox, slideSize: { widthPt: sourceImage.width, heightPt: sourceImage.height }, borders };
}
function grayFrame(target, left, top, right, bottom, color = [120, 125, 130, 255]) {
  for (let x = left; x <= right; x += 1) { setPixel(target, x, top, color); setPixel(target, x, bottom, color); }
  for (let y = top; y <= bottom; y += 1) { setPixel(target, left, y, color); setPixel(target, right, y, color); }
}

test("cleans owned gray pixels for three borders and multiple full-slide layers", () => {
  const source = image(140, 80); const layer = image(140, 80);
  const borders = [{ left: 5, right: 35, top: 5, bottom: 35 }, { left: 50, right: 80, top: 5, bottom: 35 }, { left: 95, right: 125, top: 5, bottom: 35 }];
  for (const border of borders) { grayFrame(source, border.left, border.top, border.right, border.bottom); grayFrame(layer, border.left, border.top, border.right, border.bottom); }
  const first = cleanGrayBorderPixels(request(source, layer, borders));
  const secondLayer = { width: layer.width, height: layer.height, rgba: new Uint8Array(layer.rgba) };
  const second = cleanGrayBorderPixels(request(source, secondLayer, borders));
  assert.equal(first.changedPixels, 108);
  assert.equal(second.changedPixels, 108);
  assert.deepEqual(getPixel(first.image, 5, 20), [255, 255, 255, 255]);
  assert.deepEqual(getPixel(first.image, 20, 5), [255, 255, 255, 255]);
  assert.deepEqual(getPixel(first.image, 5, 5), [120, 125, 130, 255]);
  assert.deepEqual(getPixel(layer, 5, 20), [120, 125, 130, 255]);
});

test("maps layer centres into scaled source coordinates exactly", () => {
  const source = image(100, 80); const layer = image(20, 16);
  grayFrame(source, 22, 12, 72, 62); grayFrame(layer, 4, 2, 14, 12);
  const out = cleanGrayBorderPixels({ sourceImage: source, layerImage: layer, layerBox: { x: 0, y: 0, w: 50, h: 40 }, slideSize: { widthPt: 50, heightPt: 40 }, borders: [{ left: 22, right: 72, top: 12, bottom: 62 }] });
  assert.equal(out.changedPixels, 20);
  assert.deepEqual(getPixel(out.image, 4, 8), [255, 255, 255, 255]);
  assert.deepEqual(getPixel(out.image, 4, 2), [120, 125, 130, 255]);
});

test("returns the original layer image for no work and does not mutate inputs", () => {
  const source = image(); const layer = image(); const beforeSource = new Uint8Array(source.rgba); const beforeLayer = new Uint8Array(layer.rgba);
  const out = cleanGrayBorderPixels(request(source, layer, []));
  assert.equal(out.image, layer); assert.equal(out.changedPixels, 0);
  assert.deepEqual(source.rgba, beforeSource); assert.deepEqual(layer.rgba, beforeLayer);
});

test("preserves pixels outside owned straight edges, transparent, coloured, and corner pixels", () => {
  const source = image(); const layer = image(); const border = { left: 10, right: 50, top: 10, bottom: 50 };
  grayFrame(source, 10, 10, 50, 50); grayFrame(layer, 10, 10, 50, 50);
  setPixel(layer, 10, 25, [0, 100, 220, 255]);
  setPixel(layer, 10, 26, [120, 125, 130, 159]);
  setPixel(source, 10, 27, [120, 125, 130, 159]);
  setPixel(layer, 30, 30, [120, 125, 130, 255]);
  const out = cleanGrayBorderPixels(request(source, layer, [border]));
  assert.deepEqual(getPixel(out.image, 10, 10), [120, 125, 130, 255]);
  assert.deepEqual(getPixel(out.image, 10, 25), [0, 100, 220, 255]);
  assert.deepEqual(getPixel(out.image, 10, 26), [120, 125, 130, 159]);
  assert.deepEqual(getPixel(out.image, 10, 27), [120, 125, 130, 255]);
  assert.deepEqual(getPixel(out.image, 30, 30), [120, 125, 130, 255]);
  assert.deepEqual(getPixel(out.image, 10, 28), [255, 255, 255, 255]);
});

test("rejects malformed, out-of-bounds, and extreme inputs without returning pixel values", () => {
  const valid = image(); const border = { left: 10, right: 50, top: 10, bottom: 50 };
  for (const bad of [null, {}, { sourceImage: valid }, request(valid, valid, [{ left: 1.5, right: 4, top: 1, bottom: 4 }]), request(valid, valid, [{ left: 1, right: 90, top: 1, bottom: 4 }])]) {
    assert.throws(() => cleanGrayBorderPixels(bad), /gray border pixel/i);
  }
  assert.throws(() => cleanGrayBorderPixels({ ...request(valid, valid, [border]), layerBox: { x: 0, y: 0, w: 81, h: 60 } }), /outside/i);
  assert.throws(() => cleanGrayBorderPixels({ ...request(valid, valid, [border]), slideSize: { widthPt: Number.MIN_VALUE, heightPt: 60 } }), /slide size/i);
  assert.throws(() => cleanGrayBorderPixels(request(valid, valid, Array.from({ length: 129 }, () => border))), /Too many/i);
});

test("enforces image and sampling limits before traversal", () => {
  const source = image(20, 20); const oversized = image(500, 500);
  const border = { left: 0, right: 19, top: 0, bottom: 19 };
  assert.throws(() => cleanGrayBorderPixels(request(source, oversized, Array.from({ length: 128 }, () => border))), /sampling limit/i);
  assert.throws(() => cleanGrayBorderPixels({ ...request(source, source, []), sourceImage: { width: 16_385, height: 1, rgba: new Uint8Array(4) } }), /source image/i);
});
