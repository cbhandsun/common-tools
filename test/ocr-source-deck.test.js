"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/team-native-rebuild");

test("OCR admission snapshots valid output and rejects accessors, proxies, sparse and oversized arrays", () => {
  const { admitOcrResult } = require("../packages/slideclone-core/ocr-result-admission");
  const size = { widthPx: 960, heightPx: 540 };
  const source = { lines: [{ text: " Al Agent ", box: { x: 1, y: 2, w: 20, h: 10 } }] };
  const admitted = admitOcrResult(source, size);
  assert.equal(admitted.lines[0].confidence, 1);
  assert.equal(admitted.lines[0].text, " Al Agent ");
  source.lines[0].box.x = 99;
  assert.equal(admitted.lines[0].box.x, 1);
  assert.ok(Object.isFrozen(admitted.lines[0].box));
  assert.deepEqual(admitOcrResult({ lines: [] }, size), { lines: [] });
  let calls = 0;
  const getter = { get lines() { calls++; return []; } };
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { calls++; throw new Error("secret"); } });
  const indexed = [];
  Object.defineProperty(indexed, "0", { get() { calls++; return {}; } });
  for (const value of [getter, proxy, { lines: indexed }, { lines: new Array(1) }, { lines: new Array(10001) }, { lines: new Proxy([], {}) }]) {
    assert.throws(() => admitOcrResult(value, size), /OCR/);
  }
  assert.equal(calls, 0);
  for (const text of ["", "x".repeat(513), "secret\0"]) {
    assert.throws(() => admitOcrResult({ lines: [{ ...admitted.lines[0], text }] }, size), error => !error.message.includes("secret"));
  }
  assert.throws(() => admitOcrResult({ lines: [{ ...admitted.lines[0], box: { x: 959, y: 0, w: 2, h: 2 } }] }, size), /box/);
});

function input() {
  return { metadata: { dimensions: { widthPx: 960, heightPx: 540 } }, sourceImage: "assets/source.png", ocr: { lines: [{ text: " Example ", box: { x: 10, y: 20, w: 100, h: 30 }, confidence: 0.9 }] } };
}

test("OCR source IR rejects zero, negative, excessive and non-numeric dimensions before projection", () => {
  for (const [widthPx, heightPx] of [[0, 10], [-1, 10], [10, 0], [16385, 1], [10000, 10000], [Infinity, 10], ["960", 540]]) {
    const value = input(); value.metadata.dimensions = { widthPx, heightPx }; value.ocr.lines = [];
    assert.throws(() => boundedOcrSourceDeck(value), /dimensions/);
  }
});

test("OCR source IR rejects traversal and cross-platform absolute paths without echoing them", () => {
  for (const sourceImage of ["../fixture-private.png", "assets/../fixture-private.png", "/fixture-private.png", "C:\\fixture-private.png", "C:fixture-private.png", "\\\\server\\fixture-private.png", "assets\\fixture-private.png", "assets//fixture-private.png", "assets/file\n.png"]) {
    assert.throws(() => boundedOcrSourceDeck({ ...input(), sourceImage }), (error) => /source path/.test(error.message) && !error.message.includes("fixture-private"));
  }
});

test("OCR source IR accepts an empty OCR result but rejects malformed payloads and confidence", () => {
  assert.deepEqual(boundedOcrSourceDeck({ ...input(), ocr: { lines: [] } }).pages[0].textBoxes, []);
  for (const ocr of [null, [], {}, { lines: "invalid" }, { lines: [null] }, { lines: new Array(10001).fill(input().ocr.lines[0]) }]) {
    assert.throws(() => boundedOcrSourceDeck({ ...input(), ocr }), /OCR/);
  }
  for (const confidence of [-1, 1.1, Infinity, NaN, "0.9", null]) {
    const value = input(); value.ocr.lines[0].confidence = confidence;
    assert.throws(() => boundedOcrSourceDeck(value), /OCR/);
  }
});

test("OCR source IR preserves text, editable hidden overlays, confidence and exact coordinates", () => {
  const value = input(); const before = structuredClone(value);
  const deck = boundedOcrSourceDeck(value); const text = deck.pages[0].textBoxes[0];
  assert.equal(deck.version, "1.0");
  assert.deepEqual(deck.slideSize, { widthPt: 960, heightPt: 540 });
  assert.equal(text.text, "Example");
  assert.deepEqual(text.box, value.ocr.lines[0].box);
  assert.deepEqual(text.source.evidenceBox, text.box);
  assert.equal(text.source.confidence, 0.9);
  assert.equal(text.source.editable, true);
  assert.equal(text.font.opacity, 0);
  assert.equal(text.style.visibility, "hidden");
  assert.deepEqual(value, before);
});

test("OCR source IR rejects invalid and out-of-bounds text boxes without leaking user text", () => {
  for (const box of [{ x: -1, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 1 }, { x: 959, y: 0, w: 2, h: 1 }, { x: 0, y: 0, w: Infinity, h: 1 }, { x: "0", y: 0, w: 1, h: 1 }]) {
    const value = input(); value.ocr.lines[0] = { text: "fixture-private-content", box };
    assert.throws(() => boundedOcrSourceDeck(value), (error) => /OCR/.test(error.message) && !error.message.includes("fixture-private-content"));
  }
  for (const text of ["", " ", "x".repeat(513), "private\0content"]) {
    const value = input(); value.ocr.lines[0].text = text;
    assert.throws(() => boundedOcrSourceDeck(value), /OCR/);
  }
});

test("OCR source IR keeps canonical contextual correction and the one-pixel boundary", () => {
  const value = input(); value.ocr.lines = [{ text: "Al Agent", box: { x: 0, y: 0, w: 1, h: 1 } }, { text: "AI Agent", box: { x: 0, y: 0, w: 1, h: 1 } }];
  value.metadata.dimensions = { widthPx: 1, heightPx: 1 };
  const deck = boundedOcrSourceDeck(value);
  assert.equal(deck.pages[0].textBoxes[0].text, "AI Agent");
  assert.equal(deck.pages[0].textBoxes[0].source.confidence, 1);
  assert.deepEqual(deck.pages[0].textBoxes[0].box, { x: 0, y: 0, w: 960, h: 960 });
});
