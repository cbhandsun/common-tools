"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { sampleInkColor } = require("../packages/slideclone-core/raster-native-detection");
const { enclosedLightInkColor } = require("../packages/slideclone-core/enclosed-light-ink");

function fixture(ink = [255, 255, 255, 255]) {
  const image = { width: 100, height: 100, rgba: new Uint8Array(40000).fill(255) };
  for (let y = 15; y < 85; y++) for (let x = 15; x < 85; x++) {
    if (Math.hypot(x - 50, y - 50) < 35) image.rgba.set([0, 118, 220, 255], (y * 100 + x) * 4);
  }
  for (let y = 32; y < 67; y++) for (let x = 33; x < 65; x++) {
    if (y < 38 || Math.abs(x - (65 - (y - 38) * .7)) < 3) image.rgba.set(ink, (y * 100 + x) * 4);
  }
  return image;
}

test("native text sampling keeps enclosed light ink when the OCR window reaches the white page", () => {
  const image = fixture(), before = image.rgba.slice();
  assert.equal(sampleInkColor(image, { x: 12, y: 12, w: 76, h: 76 }, { widthPt: 100, heightPt: 100 }), "#FFFFFF");
  assert.deepEqual(image.rgba, before);
});

test("enclosed light ink keeps the observed palette rather than forcing white", () => {
  assert.equal(enclosedLightInkColor(fixture([244, 240, 230, 255])), "#F4F0E6");
});

test("white page, wide counters and empty evidence cannot authorize light ink", () => {
  assert.equal(enclosedLightInkColor({ width: 1, height: 1, rgba: new Uint8Array(4) }), null);
  const image = fixture(); image.rgba.fill(255);
  assert.equal(enclosedLightInkColor(image), null);
  image.rgba.fill(0);
  for (let i = 0; i < 10000; i++) image.rgba.set([20, 30, 40, 255], i * 4);
  for (let y = 30; y < 70; y++) for (let x = 35; x < 65; x++) image.rgba.set([255, 255, 255, 255], (y * 100 + x) * 4);
  assert.equal(enclosedLightInkColor(image), null);
});

test("clipped strokes, missing surface ring and transparency retain the fallback", () => {
  const clipped = fixture();
  for (let y = 0; y < 34; y++) for (let x = 33; x < 39; x++) clipped.rgba.set([255, 255, 255, 255], (y * 100 + x) * 4);
  assert.equal(enclosedLightInkColor(clipped), null);
  const transparent = fixture();
  for (let y = 25; y < 75; y++) for (let x = 25; x < 75; x++) transparent.rgba[(y * 100 + x) * 4 + 3] = 0;
  assert.equal(enclosedLightInkColor(transparent), null);
  const narrow = { width: 33, height: 37, rgba: new Uint8Array(33 * 37 * 4) }, full = fixture();
  for (let y = 0; y < narrow.height; y++) for (let x = 0; x < narrow.width; x++) narrow.rgba.set(full.rgba.subarray(((y + 31) * 100 + x + 32) * 4, ((y + 31) * 100 + x + 32) * 4 + 4), (y * narrow.width + x) * 4);
  assert.equal(enclosedLightInkColor(narrow), null);
});

test("mixed surface evidence and conflicting light colors are rejected", () => {
  const image = fixture();
  for (let y = 15; y < 85; y++) for (let x = 15; x < 85; x++) {
    const o = (y * 100 + x) * 4;
    if (image.rgba[o] === 0 && (x + y) % 2) image.rgba.set([120, 0, 70, 255], o);
  }
  assert.equal(enclosedLightInkColor(image), null);
  const a = fixture(), b = fixture([255, 255, 180, 255]), joined = { width: 200, height: 100, rgba: new Uint8Array(80000) };
  for (let y = 0; y < 100; y++) {
    joined.rgba.set(a.rgba.subarray(y * 400, (y + 1) * 400), y * 800);
    joined.rgba.set(b.rgba.subarray(y * 400, (y + 1) * 400), y * 800 + 400);
  }
  assert.equal(enclosedLightInkColor(joined), null);
});

test("ordinary dark text retains the original native color selection", () => {
  const image = { width: 50, height: 50, rgba: new Uint8Array(10000).fill(255) };
  for (let y = 15; y < 35; y++) for (let x = 18; x < 25; x++) image.rgba.set([20, 30, 40, 255], (y * 50 + x) * 4);
  assert.equal(enclosedLightInkColor(image), null);
  assert.equal(sampleInkColor(image, { x: 12, y: 12, w: 26, h: 26 }, { widthPt: 50, heightPt: 50 }), "#141E28");
});

test("a light pictorial mark alongside dark OCR glyphs has no authority to recolor the line", () => {
  const image = fixture();
  for (let y = 30; y < 60; y++) for (let x = 73; x < 79; x++) image.rgba.set([0, 0, 0, 255], (y * 100 + x) * 4);
  assert.equal(enclosedLightInkColor(image), null);
});

test("unknown, oversized and hostile sample boundaries fail without invoking user code", () => {
  for (const input of [null, [], {}, { ...fixture(), width: Infinity }, { ...fixture(), width: 262145 }, { ...fixture(), height: -1 }, { ...fixture(), rgba: "secret" }, { ...fixture(), rgba: new Uint8Array(1) }]) assert.throws(() => enclosedLightInkColor(input), /Ink sample/);
  let invoked = 0;
  const getter = {}; Object.defineProperty(getter, "width", { get() { invoked++; throw Error("private"); } });
  assert.throws(() => enclosedLightInkColor(getter), /Ink sample/);
  assert.throws(() => enclosedLightInkColor(new Proxy({}, { get() { invoked++; throw Error("private"); } })), /Ink sample/);
  assert.throws(() => enclosedLightInkColor({ ...fixture(), rgba: new Proxy(new Uint8Array(40000), { get() { invoked++; throw Error("private"); } }) }), /Ink sample/);
  assert.throws(() => enclosedLightInkColor({ width: 1, height: 1, rgba: new Uint8Array(new SharedArrayBuffer(4)) }), /Ink sample/);
  const buffer = new ArrayBuffer(4, { maxByteLength: 8 });
  assert.throws(() => enclosedLightInkColor({ width: 1, height: 1, rgba: new Uint8Array(buffer) }), /Ink sample/);
  const spoofed = fixture(); Object.defineProperty(spoofed.rgba, "buffer", { get() { invoked++; throw Error("private"); } });
  assert.equal(enclosedLightInkColor(spoofed), "#FFFFFF"); assert.equal(invoked, 0);
});

test("the new source identity regression is discovered by unified CI", () => {
  const { includesSuite, validateTestSuiteManifest } = require("../scripts/test-suites"), fs = require("node:fs");
  assert.equal(includesSuite("test/enclosed-light-ink.test.js", "unit"), true);
  assert.deepEqual(validateTestSuiteManifest(fs.readdirSync(__dirname).filter(n => n.endsWith(".test.js"))), []);
});
