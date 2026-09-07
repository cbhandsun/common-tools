"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../packages/slideclone-core/png");
const { restoreOcrGlyphResiduals } = require("../packages/slideclone-core/ocr-glyph-residual");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-glyph-residual-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const source = { width: 4, height: 3, rgba: Buffer.from([
    1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    13, 14, 15, 255, 16, 17, 18, 255, 19, 20, 21, 255, 22, 23, 24, 255,
    25, 26, 27, 255, 28, 29, 30, 255, 31, 32, 33, 255, 34, 35, 36, 255
  ]) };
  const sourceFile = path.join(root, "assets", "source.png");
  writePng(sourceFile, source);
  const page = {
    pageIndex: 0,
    textBoxes: [{ id: "keep", box: { x: 0, y: 0, w: 1, h: 1 } }, { id: "glyph", box: { x: 1, y: 1, w: 2, h: 1 } }],
    images: [{ id: "existing", type: "image", assetPath: "assets/keep.png" }],
    shapes: [{ id: "shape" }]
  };
  return { root, source, sourceFile, page, input: { page, slideSize: { widthPt: 4, heightPt: 3 }, sourceFile, root, glyphs: [{ id: "glyph", box: { x: 1, y: 1, w: 2, h: 1 } }] } };
}

test("restores exact source pixels while preserving unrelated page content and source bytes", (t) => {
  const value = fixture(t); const beforeSource = fs.readFileSync(value.sourceFile);
  assert.deepEqual(restoreOcrGlyphResiduals(value.input), { restoredGlyphs: 1 });
  assert.deepEqual(value.page.textBoxes.map(item => item.id), ["keep"]);
  assert.deepEqual(value.page.images[0], { id: "existing", type: "image", assetPath: "assets/keep.png" });
  assert.deepEqual(value.page.shapes, [{ id: "shape" }]);
  const image = value.page.images[1];
  assert.equal(image.type, "fidelity-crop"); assert.equal(image.assetPath, "assets/deck-p01-ocr-glyph-001.png");
  assert.deepEqual(image.box, { x: 1, y: 1, w: 2, h: 1 });
  assert.deepEqual(image.source, { editable: false, ocrGlyphFallback: true, strategy: "uncertain-ocr-source-crop" });
  assert.deepEqual(readPng(path.join(value.root, image.assetPath)).rgba, Buffer.from([16, 17, 18, 255, 19, 20, 21, 255]));
  assert.deepEqual(fs.readFileSync(value.sourceFile), beforeSource);
});

test("empty glyphs leave the page untouched without requiring a readable source", (t) => {
  const value = fixture(t); const before = structuredClone(value.page);
  const result = restoreOcrGlyphResiduals({ ...value.input, sourceFile: path.join(value.root, "missing.png"), glyphs: [] });
  assert.deepEqual(result, { restoredGlyphs: 0 }); assert.deepEqual(value.page, before);
});

test("invalid glyphs, failures, and existing targets do not mutate the page", (t) => {
  const value = fixture(t); const before = structuredClone(value.page);
  assert.throws(() => restoreOcrGlyphResiduals({ ...value.input, glyphs: [{ id: "missing", box: { x: 1, y: 1, w: 1, h: 1 } }] }));
  assert.deepEqual(value.page, before);
  fs.writeFileSync(path.join(value.root, "assets", "deck-p01-ocr-glyph-001.png"), Buffer.from("do not overwrite"));
  assert.throws(() => restoreOcrGlyphResiduals(value.input), /already exists/u);
  assert.deepEqual(value.page, before);
  assert.deepEqual(fs.readFileSync(path.join(value.root, "assets", "deck-p01-ocr-glyph-001.png")), Buffer.from("do not overwrite"));
});

test("rejects an assets junction that escapes the requested root", (t) => {
  const value = fixture(t); const before = structuredClone(value.page);
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-glyph-external-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  const sourceFile = path.join(value.root, "source.png");
  fs.copyFileSync(value.sourceFile, sourceFile);
  value.input.sourceFile = sourceFile;
  fs.rmSync(path.join(value.root, "assets"), { recursive: true });
  fs.symlinkSync(external, path.join(value.root, "assets"), "junction");
  assert.throws(() => restoreOcrGlyphResiduals(value.input), /asset directory is invalid/u);
  assert.deepEqual(value.page, before);
  assert.equal(fs.readdirSync(external).length, 0);
});

test("publication failure rolls back all newly created crops without changing the page", (t) => {
  const value = fixture(t); const before = structuredClone(value.page);
  value.input.glyphs.push({ id: "keep", box: { x: 0, y: 0, w: 1, h: 1 } });
  const link = fs.linkSync; let calls = 0;
  t.mock.method(fs, "linkSync", (...args) => {
    calls++;
    if (calls === 2) throw new Error("simulated publication failure");
    return link(...args);
  });
  assert.throws(() => restoreOcrGlyphResiduals(value.input), /simulated publication failure/u);
  assert.deepEqual(value.page, before);
  assert.deepEqual(fs.readdirSync(path.join(value.root, "assets")), ["source.png"]);
});

test("overlapping glyphs cannot exceed the aggregate crop pixel budget", (t) => {
  const value = fixture(t);
  writePng(value.sourceFile, { width: 2000, height: 2000, rgba: Buffer.alloc(2000 * 2000 * 4, 255) });
  const box = { x: 0, y: 0, w: 2000, h: 2000 };
  value.page.textBoxes = Array.from({ length: 11 }, (_, index) => ({ id: `glyph-${index}`, box }));
  const before = structuredClone(value.page);
  assert.throws(() => restoreOcrGlyphResiduals({ ...value.input, slideSize: { widthPt: 2000, heightPt: 2000 }, glyphs: value.page.textBoxes }), /crops exceed the processing boundary/u);
  assert.deepEqual(value.page, before);
  assert.deepEqual(fs.readdirSync(path.join(value.root, "assets")), ["source.png"]);
});
