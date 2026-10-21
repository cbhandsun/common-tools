"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { hasTallPunctuationGraphicInk } = require("../packages/slideclone-core/ocr-punctuation-graphic-evidence");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr-source-deck");
const { restoreOcrGlyphResiduals } = require("../packages/slideclone-core/ocr-glyph-residual");
const { writePng } = require("../packages/slideclone-core/png");

function raster(width = 160, height = 90) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
}
function fill(image, x, y, w, h, color = [25, 25, 25, 255]) {
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
    image.rgba.set(color, (row * image.width + col) * 4);
  }
}
function graphic() {
  const image = raster();
  fill(image, 8, 8, 4, 74); fill(image, 48, 8, 4, 74);
  fill(image, 8, 8, 44, 4); fill(image, 8, 78, 44, 4);
  for (let x = 65; x < 145; x += 20) fill(image, x, 42, 12, 4);
  return image;
}
const fullBox = { x: 0, y: 0, w: 160, h: 90 };

test("short flat punctuation with tall sparse graphic ink requires source evidence", () => {
  const image = graphic();
  for (const text of ["--", "___", "~~", "= ="]) assert.equal(hasTallPunctuationGraphicInk(image, text, fullBox), true);
  for (const text of ["AB", "中文", "88", "?", "A--", "-", "-".repeat(9), "--\0", "--\n--"]) {
    assert.equal(hasTallPunctuationGraphicInk(image, text, fullBox), false);
  }
  assert.equal(hasTallPunctuationGraphicInk(null, "--", fullBox), false);
});

test("normal separators, blank, transparent, noise and dense regions are not graphics", () => {
  const separator = raster(); fill(separator, 8, 42, 140, 4);
  const transparent = graphic();
  for (let offset = 3; offset < transparent.rgba.length; offset += 4) transparent.rgba[offset] = 0;
  const noisy = raster(); fill(noisy, 0, 0, 3, 3); fill(noisy, 157, 87, 3, 3);
  const dense = raster(); fill(dense, 0, 0, 160, 90);
  for (const image of [separator, raster(), transparent, noisy, dense]) {
    assert.equal(hasTallPunctuationGraphicInk(image, "--", fullBox), false);
  }
});

test("evidence rejects invalid buffers, source boundaries and oversized windows safely", () => {
  for (const image of [{ ...graphic(), rgba: Buffer.alloc(4) }, { ...graphic(), width: NaN }, { ...graphic(), height: 0 }]) {
    assert.equal(hasTallPunctuationGraphicInk(image, "--", fullBox), false);
  }
  for (const box of [null, { ...fullBox, x: -1 }, { ...fullBox, w: 161 }, { ...fullBox, h: Infinity }, { ...fullBox, w: "160" }]) {
    assert.equal(hasTallPunctuationGraphicInk(graphic(), "--", box), false);
  }
  const large = raster(513, 512);
  assert.equal(hasTallPunctuationGraphicInk(large, "--", { x: 0, y: 0, w: 513, h: 512 }), false);
});

function request(image = graphic(), candidate = {}) {
  return { metadata: { dimensions: { widthPx: 160, heightPx: 90 } }, sourceImage: "assets/source.png",
    sourceRaster: image, preserveUncertainGlyphs: true,
    ocr: { lines: Array.from({ length: 4 }, (_, i) => ({ text: `Label ${i}`, confidence: 0.95,
      box: { x: 60, y: i * 12, w: 90, h: 10 } })).concat([{ text: "--", confidence: 0.55, box: fullBox, ...candidate }]) } };
}

test("admission preserves text without confidence, scale and raster evidence together", () => {
  const value = request(); const before = structuredClone(value);
  before.sourceRaster.rgba = Buffer.from(before.sourceRaster.rgba);
  const admitted = boundedOcrSourceDeck(value);
  assert.equal(admitted.pages[0].textBoxes.length, 4);
  assert.equal(admitted.meta.ocrAdmission.rasterFallbackGlyphs, 1);
  assert.deepEqual(value, before);
  for (const candidate of [{ confidence: 0.65 }, { text: "88" }, { text: "标题" }, { box: { x: 0, y: 0, w: 160, h: 18 } }]) {
    assert.equal(boundedOcrSourceDeck(request(graphic(), candidate)).pages[0].textBoxes.length, 5);
  }
  assert.equal(boundedOcrSourceDeck({ ...request(), sourceRaster: undefined }).pages[0].textBoxes.length, 5);
  assert.equal(boundedOcrSourceDeck({ ...request(), preserveUncertainGlyphs: false }).pages[0].textBoxes.length, 5);
  const sparse = request(); sparse.ocr.lines = sparse.ocr.lines.slice(2);
  assert.equal(boundedOcrSourceDeck(sparse).pages[0].textBoxes.length, 3);
});

test("confirmed punctuation graphics recover as separate native contours, not a mixed screenshot", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-punctuation-graphic-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"); writePng(sourceFile, graphic());
  const original = boundedOcrSourceDeck({ ...request(), preserveUncertainGlyphs: false });
  const admitted = boundedOcrSourceDeck(request());
  const glyphs = original.pages[0].textBoxes.filter(item => !admitted.pages[0].textBoxes.some(other => other.id === item.id));
  const page = original.pages[0];
  const result = restoreOcrGlyphResiduals({ page, slideSize: original.slideSize, sourceFile, root, glyphs });
  assert.equal(result.restoredGlyphs, 1); assert.equal(result.nativeGlyphs, 1);
  assert.equal(page.images.length, 0); assert.equal(page.textBoxes.length, 4);
  assert.equal(page.shapes.length, 5);
  assert.ok(page.shapes.every(shape => shape.type === "freeform" && shape.source.editable === true
    && shape.source.detector === "ocr-punctuation-graphic-native-contour" && shape.style.freeformSegments.length <= 120));
  assert.ok(!fs.existsSync(path.join(root, "assets", "deck-p01-ocr-glyph-001.png")));
});

test("overlapping OCR candidates cannot exceed the aggregate source scan budget", () => {
  const value = request();
  value.ocr.lines = value.ocr.lines.slice(0, 4).concat(Array.from({ length: 300 }, () => ({
    text: "--", confidence: 0.55, box: { ...fullBox }
  })));
  const deck = boundedOcrSourceDeck(value);
  assert.equal(deck.meta.ocrAdmission.rasterFallbackGlyphs, Math.floor(4_000_000 / (160 * 90)));
  assert.equal(deck.pages[0].textBoxes.length, 304 - deck.meta.ocrAdmission.rasterFallbackGlyphs);
});
