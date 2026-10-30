"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../packages/slideclone-core/png");
const { restoreOcrGlyphResiduals } = require("../packages/slideclone-core/ocr/ocr-glyph-residual");
const { sourceGraphicEvidence } = require("../packages/slideclone-core/ocr/ocr-source-graphic-evidence");
const { auditNativeComponentQuality } = require("../packages/slideclone-core/quality/native-component-quality");

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
  assert.deepEqual(restoreOcrGlyphResiduals(value.input), { restoredGlyphs: 1, nativeGlyphs: 0 });
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

function blankImage(width, height, color = [255, 255, 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}

function setPixel(image, x, y, color = [20, 20, 20]) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = color[0];
  image.rgba[offset + 1] = color[1];
  image.rgba[offset + 2] = color[2];
  image.rgba[offset + 3] = 255;
}

function drawEllipseOutline(image, cx, cy, rx, ry, thickness = 3) {
  for (let y = Math.floor(cy - ry - thickness); y <= cy + ry + thickness; y += 1) {
    for (let x = Math.floor(cx - rx - thickness); x <= cx + rx + thickness; x += 1) {
      const value = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (Math.abs(value - 1) < 0.16) setPixel(image, x, y);
    }
  }
}

function drawArcOutline(image, cx, cy, rx, ry, startDeg, endDeg, thickness = 3) {
  for (let y = Math.floor(cy - ry - thickness); y <= cy + ry + thickness; y += 1) {
    for (let x = Math.floor(cx - rx - thickness); x <= cx + rx + thickness; x += 1) {
      const angle = (Math.atan2((y - cy) / ry, (x - cx) / rx) * 180 / Math.PI + 360) % 360;
      const value = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (Math.abs(value - 1) < 0.18 && angle >= startDeg && angle <= endDeg) setPixel(image, x, y);
    }
  }
}

test("avatar-like OCR glyph fallback is rebuilt as editable native icon shapes", (t) => {
  const value = fixture(t);
  const source = blankImage(160, 150);
  drawEllipseOutline(source, 70, 42, 32, 32);
  drawArcOutline(source, 64, 126, 58, 58, 195, 345);
  drawEllipseOutline(source, 112, 96, 28, 28);
  drawArcOutline(source, 110, 142, 38, 36, 205, 335);
  writePng(value.sourceFile, source);
  value.page.textBoxes = [{ id: "glyph", box: { x: 0, y: 0, w: 160, h: 150 } }];
  value.page.images = [];
  value.page.shapes = [];

  const result = restoreOcrGlyphResiduals({
    ...value.input,
    slideSize: { widthPt: 160, heightPt: 150 },
    glyphs: value.page.textBoxes
  });

  assert.deepEqual(result, { restoredGlyphs: 1, nativeGlyphs: 1 });
  assert.deepEqual(value.page.textBoxes, []);
  assert.deepEqual(value.page.images, []);
  assert.ok(value.page.shapes.length >= 1 && value.page.shapes.length <= 16);
  assert.equal(value.page.shapes.every((shape) => shape.source?.detector === "ocr-glyph-native-icon"), true);
  assert.equal(value.page.shapes.some((shape) => shape.source?.semanticNativeStructure === true), false);
  assert.equal(value.page.shapes.every((shape) => shape.type === "freeform"), true);
  assert.equal(value.page.shapes.some((shape) => shape.source?.iconPart === "ink-run"), false);
  assert.equal(value.page.shapes.every((shape) => shape.style.freeformSegments.length <= 120), true);
  assert.deepEqual(fs.readdirSync(path.join(value.root, "assets")), ["source.png"]);
  const nativeBefore = structuredClone(value.page.shapes);
  const glyph = { id: "glyph", box: { x: 0, y: 0, w: 160, h: 150 } };
  value.page.textBoxes = [glyph];
  restoreOcrGlyphResiduals({ ...value.input, slideSize: { widthPt: 160, heightPt: 150 }, glyphs: [glyph] });
  assert.deepEqual(value.page.shapes, nativeBefore);
  assert.equal(new Set(value.page.shapes.map(shape => shape.id)).size, value.page.shapes.length);
  const unrelated = { ...nativeBefore[0], source: { ...nativeBefore[0].source, detector: "unrelated-owner" } };
  value.page.shapes.push(unrelated);
  value.page.textBoxes = [glyph];
  const collisionBefore = structuredClone(value.page);
  assert.throws(() => restoreOcrGlyphResiduals({ ...value.input, slideSize: { widthPt: 160, heightPt: 150 }, glyphs: [glyph] }), /identity is ambiguous/u);
  assert.deepEqual(value.page, collisionBefore);
  value.page.shapes = nativeBefore;
  const secondGlyph = { ...glyph, id: "other-glyph" };
  value.page.textBoxes = [secondGlyph];
  restoreOcrGlyphResiduals({ ...value.input, slideSize: { widthPt: 160, heightPt: 150 }, glyphs: [secondGlyph] });
  assert.equal(value.page.shapes.length, nativeBefore.length * 2);
  assert.equal(new Set(value.page.shapes.map(shape => shape.id)).size, value.page.shapes.length);
  assert.deepEqual(value.page.shapes.slice(0, nativeBefore.length), nativeBefore);
});

test("source-evidenced pictorial OCR becomes one tight exact crop without speculative vectorization", (t) => {
  const value = fixture(t);
  const source = blankImage(140, 100);
  for (let y = 30; y < 58; y += 1) for (let x = 40; x < 53; x += 1) setPixel(source, x, y, [25, 115, 225]);
  for (let y = 35; y < 57; y += 1) for (let x = 68; x < 79; x += 1) setPixel(source, x, y, [225, 65, 90]);
  for (let x = 54; x < 67; x += 1) for (let y = 61; y < 64; y += 1) setPixel(source, x, y);
  writePng(value.sourceFile, source);
  const candidate = { text: "A", confidence: 0.22, box: { x: 34, y: 24, w: 52, h: 46 } };
  const referenceRows = [2, 12, 76, 88];
  const references = referenceRows.map((y, index) => ({ text: `Label ${index}`, confidence: 0.98,
    box: { x: 90, y, w: 45, h: 10 } }));
  const evidence = sourceGraphicEvidence({ image: source, line: candidate, lines: references.concat([candidate]), referenceHeight: 10 });
  assert.ok(evidence);
  const glyph = { id: "glyph", text: candidate.text, box: candidate.box, source: { ocrGraphicEvidence: evidence } };
  value.page.textBoxes = [glyph]; value.page.images = []; value.page.shapes = [];
  const result = restoreOcrGlyphResiduals({ ...value.input, slideSize: { widthPt: 140, heightPt: 100 }, glyphs: [glyph] });
  assert.deepEqual(result, { restoredGlyphs: 1, nativeGlyphs: 0 });
  assert.deepEqual(value.page.textBoxes, []); assert.deepEqual(value.page.shapes, []);
  assert.equal(value.page.images.length, 1);
  assert.equal(value.page.images[0].source.strategy, "source-evidenced-tight-pictorial-crop");
  assert.equal(value.page.images[0].source.detector, "ocr-source-geometry-pictorial-crop");
  assert.deepEqual(value.page.images[0].source.tightenedPixelBox, evidence.tightenedPixelBox);
  assert.deepEqual(value.page.images[0].source.coordinateReferenceSizePx, { width: source.width, height: source.height });
  assert.deepEqual(value.page.images[0].source.mappedPixelBox, candidate.box);
  assert.equal(value.page.images[0].source.removedNeighborPixels, 0);
  assert.equal(value.page.images[0].source.retainedDetailComponents, evidence.metrics.significantComponents - 1);
  assert.equal(auditNativeComponentQuality({ pages: [value.page] }).passed, true);
  const restored = readPng(path.join(value.root, value.page.images[0].assetPath));
  assert.equal(restored.width, evidence.tightenedPixelBox.w); assert.equal(restored.height, evidence.tightenedPixelBox.h);
  assert.deepEqual(restored.rgba, require("../packages/slideclone-core/png").cropPng(source, evidence.tightenedPixelBox).rgba);
});

test("stale OCR graphic evidence fails before page mutation or asset publication", (t) => {
  const value = fixture(t);
  value.page.textBoxes[1].source = { ocrGraphicEvidence: {
    operation: "source-geometry-graphic", version: 1, kind: "pictorial-icon",
    candidatePixelBox: { x: 0, y: 0, w: 1, h: 1 }, tightenedPixelBox: { x: 0, y: 0, w: 1, h: 1 },
    scannedPixels: 1, reasons: ["chromatic-source-ink"],
    metrics: { density: 0.2, outsideRatio: 0.1, chromaticRatio: 0.3, significantComponents: 2, largestComponentRatio: 0.7 }
  } };
  value.input.glyphs = [value.page.textBoxes[1]];
  const before = structuredClone(value.page);
  assert.throws(() => restoreOcrGlyphResiduals(value.input), /geometry is stale/u);
  assert.deepEqual(value.page, before);
  assert.deepEqual(fs.readdirSync(path.join(value.root, "assets")), ["source.png"]);
});

function geometricEvidence(candidatePixelBox) {
  return { operation: "source-geometry-graphic", version: 1, kind: "pictorial-icon",
    candidatePixelBox, tightenedPixelBox: candidatePixelBox, scannedPixels: candidatePixelBox.w * candidatePixelBox.h,
    reasons: ["chromatic-source-ink"], metrics: { density: 0.2, outsideRatio: 0.1, chromaticRatio: 0.3,
      significantComponents: 2, largestComponentRatio: 0.7 } };
}

test("a source-bound pictorial unit can be recovered after layout has removed its OCR overlay", (t) => {
  const value = fixture(t);
  const box = { x: 1, y: 1, w: 2, h: 1 };
  const glyph = { id: "glyph", box, source: { ocrGraphicEvidence: geometricEvidence(box) } };
  value.page.textBoxes = value.page.textBoxes.filter(item => item.id !== "glyph");
  assert.deepEqual(restoreOcrGlyphResiduals({ ...value.input, glyphs: [glyph] }), { restoredGlyphs: 1, nativeGlyphs: 0 });
  assert.deepEqual(value.page.textBoxes.map(item => item.id), ["keep"]);
  assert.equal(value.page.images.at(-1).source.strategy, "source-evidenced-tight-pictorial-crop");
  assert.deepEqual(readPng(path.join(value.root, value.page.images.at(-1).assetPath)).rgba,
    require("../packages/slideclone-core/png").cropPng(value.source, box).rgba);
});

test("missing glyph identities still require valid source evidence and must not collide with other objects", (t) => {
  for (const evidence of [undefined, null, geometricEvidence({ x: 0, y: 0, w: 1, h: 1 })]) {
    const value = fixture(t);
    value.page.textBoxes = value.page.textBoxes.filter(item => item.id !== "glyph");
    const before = structuredClone(value.page);
    assert.throws(() => restoreOcrGlyphResiduals({ ...value.input, glyphs: [{ id: "glyph", box: { x: 1, y: 1, w: 2, h: 1 },
      source: { ocrGraphicEvidence: evidence } }] }));
    assert.deepEqual(value.page, before);
    assert.deepEqual(fs.readdirSync(path.join(value.root, "assets")), ["source.png"]);
  }
  const value = fixture(t), box = { x: 1, y: 1, w: 2, h: 1 };
  value.page.textBoxes = value.page.textBoxes.filter(item => item.id !== "glyph");
  value.page.shapes.push({ id: "glyph", type: "rect", box });
  const before = structuredClone(value.page);
  assert.throws(() => restoreOcrGlyphResiduals({ ...value.input, glyphs: [{ id: "glyph", box,
    source: { ocrGraphicEvidence: geometricEvidence(box) } }] }), /identity|ids/u);
  assert.deepEqual(value.page, before);
});

test("a removed flat-punctuation overlay is recoverable only with contradictory tall source ink", (t) => {
  const value = fixture(t), source = blankImage(100, 100);
  for (let y = 22; y < 77; y++) for (const x of [28, 29, 30, 68, 69, 70]) setPixel(source, x, y);
  writePng(value.sourceFile, source);
  const glyph = { id: "glyph", text: "...", box: { x: 20, y: 20, w: 60, h: 60 } };
  value.page.textBoxes = []; value.page.images = []; value.page.shapes = [];
  const result = restoreOcrGlyphResiduals({ ...value.input, slideSize: { widthPt: 100, heightPt: 100 }, glyphs: [glyph] });
  assert.equal(result.restoredGlyphs, 1);
  assert.equal(value.page.textBoxes.length, 0);
  assert.ok(value.page.shapes.length + value.page.images.length > 0);
  const other = fixture(t);
  writePng(other.sourceFile, blankImage(100, 100));
  other.page.textBoxes = []; other.page.images = []; other.page.shapes = [];
  const before = structuredClone(other.page);
  assert.throws(() => restoreOcrGlyphResiduals({ ...other.input, slideSize: { widthPt: 100, heightPt: 100 }, glyphs: [glyph] }), /ids are invalid/u);
  assert.deepEqual(other.page, before);
  for (const collection of ["images", "shapes"]) {
    const collision = fixture(t);
    writePng(collision.sourceFile, source);
    collision.page.textBoxes = []; collision.page.images = []; collision.page.shapes = [];
    collision.page[collection].push({ id: glyph.id, box: glyph.box });
    const snapshot = structuredClone(collision.page);
    assert.throws(() => restoreOcrGlyphResiduals({ ...collision.input,
      slideSize: { widthPt: 100, heightPt: 100 }, glyphs: [glyph] }), /ids are invalid/u);
    assert.deepEqual(collision.page, snapshot);
    assert.deepEqual(fs.readdirSync(path.join(collision.root, "assets")), ["source.png"]);
  }
});

test("pixel geometry survives fractional slide scaling without admitting a genuinely moved evidence box", (t) => {
  const value = fixture(t);
  const source = blankImage(113, 97), pixels = { x: 43, y: 31, w: 17, h: 19 };
  writePng(value.sourceFile, source);
  const slideSize = { widthPt: 960, heightPt: 824 };
  const box = { x: pixels.x * slideSize.widthPt / source.width, y: pixels.y * slideSize.heightPt / source.height,
    w: pixels.w * slideSize.widthPt / source.width, h: pixels.h * slideSize.heightPt / source.height };
  const glyph = { id: "glyph", box, source: { ocrGraphicEvidence: geometricEvidence(pixels) } };
  value.page.textBoxes = [glyph]; value.page.images = []; value.page.shapes = [];
  assert.deepEqual(restoreOcrGlyphResiduals({ ...value.input, slideSize, glyphs: [glyph] }), { restoredGlyphs: 1, nativeGlyphs: 0 });
  assert.deepEqual(value.page.images[0].source.originalPixelBox, pixels);
  const other = fixture(t);
  writePng(other.sourceFile, source);
  const moved = { ...glyph, box: { ...box, x: box.x + 0.01 } };
  other.page.textBoxes = [moved]; other.page.images = []; other.page.shapes = [];
  const before = structuredClone(other.page);
  assert.throws(() => restoreOcrGlyphResiduals({ ...other.input, slideSize, glyphs: [moved] }), /geometry is stale/u);
  assert.deepEqual(other.page, before);
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
