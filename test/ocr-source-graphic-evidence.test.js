"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { sourceGraphicEvidence, inspectSourceGraphicEvidence } = require("../packages/slideclone-core/ocr-source-graphic-evidence");

function image(width = 180, height = 110) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
}

function fill(value, x, y, w, h, color) {
  for (let row = y; row < y + h; row += 1) for (let column = x; column < x + w; column += 1) {
    value.rgba.set(color, (row * value.width + column) * 4);
  }
}

function request(candidate = {}, raster = image()) {
  const line = { text: "A", confidence: 0.24, box: { x: 72, y: 34, w: 30, h: 30 }, ...candidate };
  const references = Array.from({ length: 4 }, (_, index) => ({ text: `Label ${index}`, confidence: 0.96,
    box: { x: 112, y: 8 + index * 22, w: 56, h: 10 } }));
  return { image: raster, line, lines: references.concat([line]), referenceHeight: 10 };
}

function pictorial() {
  const value = image();
  fill(value, 76, 38, 9, 20, [15, 110, 220, 255]);
  fill(value, 90, 43, 8, 16, [235, 70, 85, 255]);
  fill(value, 82, 61, 10, 2, [25, 45, 70, 255]);
  return value;
}

test("isolated low-confidence pictorial OCR is admitted from source topology and tightened", () => {
  const evidence = sourceGraphicEvidence(request({}, pictorial()));
  assert.ok(evidence);
  assert.equal(evidence.operation, "source-geometry-graphic");
  assert.equal(evidence.kind, "pictorial-icon");
  assert.deepEqual(evidence.candidatePixelBox, { x: 72, y: 34, w: 30, h: 30 });
  assert.ok(evidence.tightenedPixelBox.x >= 72 && evidence.tightenedPixelBox.y >= 34);
  assert.ok(evidence.tightenedPixelBox.x + evidence.tightenedPixelBox.w <= 102);
  assert.ok(evidence.tightenedPixelBox.y + evidence.tightenedPixelBox.h <= 64);
  assert.ok(evidence.tightenedPixelBox.w < 30 || evidence.tightenedPixelBox.h < 30);
  assert.ok(evidence.reasons.includes("chromatic-source-ink") || evidence.reasons.includes("isolated-multipart-source-ink"));
  assert.equal(Object.isFrozen(evidence), true);
});

test("ordinary labels and punctuation remain text without positive pictorial evidence", () => {
  const simple = image();
  fill(simple, 84, 39, 4, 19, [20, 20, 20, 255]);
  fill(simple, 80, 39, 12, 3, [20, 20, 20, 255]);
  assert.equal(sourceGraphicEvidence(request({}, simple)), null);
  assert.equal(sourceGraphicEvidence(request({ text: "." }, pictorial())), null);
  assert.equal(sourceGraphicEvidence(request({ confidence: 0.9 }, pictorial())), null);
  assert.equal(sourceGraphicEvidence(request({ box: { x: 72, y: 34, w: 8, h: 10 } }, pictorial())), null);
});

test("a nearby supported text row wins over ambiguous icon-like pixels", () => {
  const value = request({}, pictorial());
  value.lines.push({ text: "supported text", confidence: 0.99, box: { x: 104, y: 42, w: 58, h: 11 } });
  assert.equal(sourceGraphicEvidence(value), null);
});

test("empty, invalid, extreme and budget-exhausted evidence fails closed", () => {
  const base = request({}, pictorial());
  for (const value of [null, {}, { ...base, image: null }, { ...base, lines: null },
    { ...base, referenceHeight: 0 }, { ...base, maxScanPixels: 1 },
    { ...base, image: { ...base.image, rgba: Buffer.alloc(4) } },
    { ...base, image: { ...base.image, width: 20000 } },
    { ...base, line: { ...base.line, confidence: Number.NaN } }]) {
    assert.equal(sourceGraphicEvidence(value), null);
  }
});

test("proxy and accessor inputs are rejected without executing getters", () => {
  let executed = false;
  const accessor = {};
  Object.defineProperty(accessor, "image", { get() { executed = true; return pictorial(); } });
  assert.equal(sourceGraphicEvidence(accessor), null);
  assert.equal(sourceGraphicEvidence(new Proxy(request({}, pictorial()), {})), null);
  assert.equal(executed, false);
});

test("nested accessors, proxies, sparse and poisoned OCR lists fail closed without executing user code", () => {
  const base = request({}, pictorial());
  let executed = false;
  const unsafe = () => { executed = true; throw new Error("unsafe input"); };
  const lines = base.lines.slice();
  Object.defineProperty(lines, "0", { get: unsafe });
  const sparse = new Array(4);
  const box = Object.defineProperty({}, "x", { get: unsafe });
  const values = [
    { ...base, lines }, { ...base, lines: sparse }, { ...base, lines: new Proxy(base.lines, { get: unsafe }) },
    { ...base, line: { ...base.line, box } }, { ...base, line: new Proxy(base.line, { get: unsafe }) },
    { ...base, image: new Proxy(base.image, { get: unsafe }) },
    { ...base, image: { ...base.image, rgba: new Proxy(base.image.rgba, { get: unsafe }) } },
    { ...base, referenceHeight: { valueOf: unsafe } }
  ];
  for (const value of values) assert.equal(sourceGraphicEvidence(value), null);
  const poisoned = base.lines.slice();
  poisoned.map = unsafe;
  assert.ok(sourceGraphicEvidence({ ...base, lines: poisoned }));
  const rgba = Buffer.from(base.image.rgba);
  Object.defineProperty(rgba, "length", { get: unsafe });
  rgba.subarray = unsafe;
  assert.ok(sourceGraphicEvidence({ ...base, image: { ...base.image, rgba } }));
  assert.equal(executed, false);
});

test("reference, text, numeric and scan limits reject malformed extremes", () => {
  const base = request({}, pictorial());
  for (const maxScanPixels of [0, -1, 1.5, NaN, Infinity, "262144"]) {
    assert.equal(sourceGraphicEvidence({ ...base, maxScanPixels }), null);
  }
  for (const referenceHeight of [0, 0.1, NaN, Infinity, base.image.height + 1]) {
    assert.equal(sourceGraphicEvidence({ ...base, referenceHeight }), null);
  }
  for (const text of ["", " ", "A".repeat(513), "\u0007", "\u007f"]) {
    assert.equal(sourceGraphicEvidence({ ...base, line: { ...base.line, text } }), null);
  }
  assert.equal(sourceGraphicEvidence({ ...base, lines: new Array(10001).fill(base.line) }), null);
  assert.equal(sourceGraphicEvidence({ ...base, image: { ...base.image, width: 16384, height: 16384 } }), null);
  const large = image(700, 700);
  assert.equal(sourceGraphicEvidence({ image: large, line: { text: "Q", confidence: 0.2,
    box: { x: 0, y: 0, w: 700, h: 700 } }, lines: [], referenceHeight: 10, maxScanPixels: Number.MAX_SAFE_INTEGER }), null);
});

test("scan accounting separates unscheduled, negative, and positive evidence without source content", () => {
  const positive = inspectSourceGraphicEvidence(request({}, pictorial()));
  assert.ok(positive.evidence);
  assert.equal(positive.scannedPixels, positive.evidence.scannedPixels);
  assert.ok(Object.isFrozen(positive));
  const negative = inspectSourceGraphicEvidence(request());
  assert.equal(negative.evidence, null);
  assert.equal(negative.scannedPixels, positive.scannedPixels);
  assert.deepEqual(Object.keys(negative).sort(), ["evidence", "scannedPixels"]);
  for (const input of [null, {}, request({ confidence: 0.99 }),
    { ...request(), maxScanPixels: negative.scannedPixels - 1 }, { ...request(), maxScanPixels: 0 }]) {
    assert.deepEqual(inspectSourceGraphicEvidence(input), { evidence: null, scannedPixels: 0 });
  }
  assert.deepEqual(inspectSourceGraphicEvidence({ ...request(), maxScanPixels: negative.scannedPixels }), negative);
});
