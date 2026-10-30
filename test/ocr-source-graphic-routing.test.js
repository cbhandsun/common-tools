"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr/ocr-source-deck");

function fixture(text, paint) {
  const width = 200, height = 200;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const fill = (x, y, w, h) => {
    for (let row = y; row < y + h; row += 1) for (let column = x; column < x + w; column += 1) {
      rgba.set([24, 24, 24, 255], (row * width + column) * 4);
    }
  };
  paint(fill);
  const references = Array.from({ length: 4 }, (_, index) => ({ text: `Reference ${index}`, confidence: 0.99,
    box: { x: 112, y: 110 + index * 18, w: 80, h: 12 } }));
  return { metadata: { dimensions: { widthPx: width, heightPx: height } }, sourceImage: "assets/source.png",
    sourceRaster: { width, height, rgba }, preserveUncertainGlyphs: true,
    ocr: { lines: references.concat([{ text, confidence: 0.57, box: { x: 20, y: 20, w: 60, h: 60 } }]) } };
}

test("multi-character flat punctuation remains a graphic candidate when tall source ink contradicts OCR", () => {
  for (const text of ["...", "----", "______"]) {
    const input = fixture(text, (fill) => { fill(30, 25, 3, 50); fill(64, 25, 3, 50); });
    const output = boundedOcrSourceDeck(input);
    assert.equal(output.meta.ocrAdmission.rasterFallbackGlyphs, 1);
    assert.equal(output.pages[0].textBoxes.length, 4);
  }
});

test("actual short punctuation and low-confidence words remain native text candidates", () => {
  const dots = fixture("...", (fill) => { fill(30, 55, 3, 3); fill(44, 55, 3, 3); fill(58, 55, 3, 3); });
  const letters = fixture("ABC", (fill) => { fill(30, 25, 3, 50); fill(64, 25, 3, 50); });
  for (const input of [dots, letters]) {
    const output = boundedOcrSourceDeck(input);
    assert.equal(output.meta.ocrAdmission.rasterFallbackGlyphs, 0);
    assert.equal(output.pages[0].textBoxes.length, 5);
  }
});

test("graphic routing still requires source evidence and an enabled fallback policy", () => {
  const input = fixture("...", (fill) => { fill(30, 25, 3, 50); fill(64, 25, 3, 50); });
  for (const request of [{ ...input, sourceRaster: undefined }, { ...input, preserveUncertainGlyphs: false }]) {
    const output = boundedOcrSourceDeck(request);
    assert.equal(output.meta.ocrAdmission.rasterFallbackGlyphs, 0);
    assert.equal(output.pages[0].textBoxes.length, 5);
  }
});
