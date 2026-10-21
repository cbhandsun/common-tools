"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr-source-deck");
const { createRawImageNativeRebuilder } = require("../packages/slideclone-core/team-native-rebuild");
const { createFullSlideResidualBuilder } = require("../packages/slideclone-core/full-slide-native-residual");
const { eraseMasks } = require("../packages/slideclone-core/residual-primitive-erasure");
const { cropPng, readPng, writePng } = require("../packages/slideclone-core/png");

function input(candidate = {}, sourceRaster) {
  return { metadata: { dimensions: { widthPx: 960, heightPx: 540 } }, sourceImage: "assets/source.png", preserveUncertainGlyphs: true,
    ...(sourceRaster ? { sourceRaster } : {}),
    ocr: { lines: [0, 1, 2, 3, 4].map(index => ({ text: `Label ${index}`, confidence: 0.95, box: { x: 10, y: 10 + index * 30, w: 120, h: 20 } })).concat([
      { text: "8", confidence: 0.7, box: { x: 300, y: 100, w: 90, h: 90 }, ...candidate },
      { text: "last label", confidence: 0.99, box: { x: 10, y: 220, w: 100, h: 20 } }
    ]) } };
}

function pictorialSource(scale = 1) {
  const width = 960 * scale, height = 540 * scale;
  const value = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  const fill = (x, y, w, h, color) => {
    for (let row = y * scale; row < (y + h) * scale; row += 1) for (let column = x * scale; column < (x + w) * scale; column += 1) {
      value.rgba.set(color, (row * width + column) * 4);
    }
  };
  fill(314, 114, 14, 31, [30, 120, 220, 255]);
  fill(350, 121, 12, 25, [230, 65, 90, 255]);
  fill(329, 151, 19, 3, [25, 40, 65, 255]);
  return value;
}

test("uncertain oversized single glyph remains editable without positive source evidence", () => {
  const value = input(); const before = structuredClone(value);
  const deck = boundedOcrSourceDeck(value);
  assert.equal(deck.pages[0].textBoxes.some(item => item.text === "8"), true);
  assert.deepEqual(deck.meta.ocrAdmission, { inputLines: 7, editableLines: 7, rasterFallbackGlyphs: 0 });
  assert.equal(deck.pages[0].textBoxes.at(-1).id, "p0-ocr-007");
  assert.deepEqual(value, before);
});

test("ordinary digits, confident large glyphs and multi-character text remain editable", () => {
  for (const candidate of [{ confidence: 0.8 }, { confidence: 1 }, { box: { x: 300, y: 100, w: 15, h: 20 } }, { text: "88" }, { text: "中文标题" }]) {
    const deck = boundedOcrSourceDeck(input(candidate));
    assert.equal(deck.pages[0].textBoxes.length, 7);
    assert.equal(deck.meta.ocrAdmission.rasterFallbackGlyphs, 0);
  }
});

test("source-evidenced pictorial fallback is content-independent and scale-relative", () => {
  for (const text of ["A", "中", "𠮷"]) {
    const value = input({ text, confidence: 0.24 }, pictorialSource());
    assert.equal(boundedOcrSourceDeck(value).meta.ocrAdmission.rasterFallbackGlyphs, 1);
    value.metadata.dimensions = { widthPx: 1920, heightPx: 1080 };
    value.ocr.lines = value.ocr.lines.map(line => ({ ...line, box: Object.fromEntries(Object.entries(line.box).map(([key, number]) => [key, number * 2])) }));
    value.sourceRaster = pictorialSource(2);
    assert.equal(boundedOcrSourceDeck(value).meta.ocrAdmission.rasterFallbackGlyphs, 1);
  }
});

test("glyph fallback requires enough reference text and explicit raster-preservation policy", () => {
  const sparse = input({ confidence: 0.24 }, pictorialSource()); sparse.ocr.lines = sparse.ocr.lines.slice(-2);
  assert.equal(boundedOcrSourceDeck(sparse).pages[0].textBoxes.length, 2);
  const disabled = input({ confidence: 0.24 }, pictorialSource()); disabled.preserveUncertainGlyphs = false;
  assert.equal(boundedOcrSourceDeck(disabled).pages[0].textBoxes.length, 7);
  const empty = input(); empty.ocr.lines = [];
  assert.equal(boundedOcrSourceDeck(empty).meta.ocrAdmission.rasterFallbackGlyphs, 0);
});

test("glyph policy does not hide invalid OCR data", () => {
  assert.throws(() => boundedOcrSourceDeck(input({ confidence: Number.NaN })), /confidence is invalid/u);
  assert.throws(() => boundedOcrSourceDeck(input({ text: "\0" })), /OCR result is invalid/u);
  const invalid = input(); invalid.preserveUncertainGlyphs = "yes";
  assert.throws(() => boundedOcrSourceDeck(invalid), /glyph policy is invalid/u);
});

test("raw rebuild restores uncertain glyph pixels after layout without changing engine input", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-glyph-residual-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const source = pictorialSource();
  const value = input({ confidence: 0.24 });
  require("./helpers/ocr-ink-fixture.cjs").paintOcrFixtureInk(source,value.ocr.lines.filter((_,index)=>index!==5));
  const inputFile = path.join(root, "assets", "source.png"); writePng(inputFile, source);
  const rebuild = createRawImageNativeRebuilder({
    rebuildDeckFromWorkDir(workDir) {
      const ir = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
      assert.equal(ir.pages[0].textBoxes.some(item => item.text === "8"), true);
      ir.pages[0].shapes.push({ id: "line", type: "line", box: { x: 500, y: 400, w: 100, h: 0 }, source: { editable: true } });
      return ir;
    },
    createFullSlideResidual: createFullSlideResidualBuilder({ eraseMasks, readPng, writePng }),
    restoreOcrGlyphs: require("../packages/slideclone-core/ocr-glyph-residual").restoreOcrGlyphResiduals,
    preserveLocalFidelityImages: true
  });
  const result = await rebuild({ root, metadata: { ...value.metadata, inputFile, assetPath: "assets/source.png" }, ocr: value.ocr, isCancellationRequested: () => false });
  assert.equal(result.deck.meta.ocrAdmission.rasterFallbackGlyphs, 1);
  assert.equal(result.deck.pages[0].textBoxes.some(item => item.text === "8"), false);
  const glyph = result.deck.pages[0].images.find(item => item.source?.ocrGlyphFallback === true);
  assert.ok(glyph);
  assert.equal(glyph.source.strategy, "source-evidenced-tight-pictorial-crop");
  assert.equal(glyph.source.protectedMinimumUnit, true);
  const restored = readPng(path.join(root, glyph.assetPath));
  assert.ok(restored.width < 90 && restored.height < 90);
  assert.deepEqual(restored.rgba, cropPng(source, glyph.source.tightenedPixelBox).rgba);
  assert.deepEqual(readPng(inputFile).rgba, source.rgba);
});
