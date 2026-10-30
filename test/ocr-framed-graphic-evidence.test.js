"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { framedGraphicEvidence } = require("../packages/slideclone-core/ocr/ocr-framed-graphic-evidence");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr/ocr-source-deck");
const { restoreOcrGlyphResiduals } = require("../packages/slideclone-core/ocr/ocr-glyph-residual");
const { writePng } = require("../packages/slideclone-core/png");

function fill(image, x, y, w, h, alpha = 255) {
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++)
    image.rgba.set([25, 25, 25, alpha], (row * image.width + col) * 4);
}
function frame({ equal = false, offsetHeader = true, alpha = 255 } = {}) {
  const image = { width: 200, height: 160, rgba: Buffer.alloc(200 * 160 * 4, 255) };
  const middle = equal ? 50 : 40, header = offsetHeader ? 18 : 10;
  fill(image, 10, 10, 4, 94, alpha); fill(image, middle, 10, 4, 94, alpha);
  fill(image, 90, header, 4, 104 - header, alpha);
  fill(image, 10, 100, 84, 4, alpha); fill(image, 10, 10, middle - 6, 4, alpha);
  fill(image, middle, header, 54 - (middle - 40), 4, alpha);
  for (let y = 42; y < 85; y += 20) fill(image, middle + 12, y, 24, 4, alpha);
  return image;
}
const box = { x: 8, y: 18, w: 88, h: 86 };
function request(image = frame(), confidence = 0.28, text = "Q") {
  return { metadata: { dimensions: { widthPx: 200, heightPx: 160 } }, sourceImage: "assets/source.png", sourceRaster: image,
    preserveUncertainGlyphs: true, ocr: { lines: Array.from({ length: 4 }, (_, i) => ({ text: `Body ${i}`, confidence: 0.95,
      box: { x: 115, y: i * 35, w: 80, h: 40 } })).concat([{ text, confidence, box }]) } };
}

test("connected unequal pane frames recover clipped source bounds without depending on OCR text", () => {
  const image = frame(), before = Buffer.from(image.rgba);
  const evidence = framedGraphicEvidence(image, box);
  assert.deepEqual(evidence.pixelBox, { x: 10, y: 10, w: 84, h: 94 });
  assert.ok(evidence.scannedPixels <= 262144);
  assert.deepEqual(image.rgba, before);
  for (const text of ["Q", "9", "\u9f20", "\u7530"]) assert.equal(boundedOcrSourceDeck(request(image, 0.28, text)).pages[0].textBoxes.length, 4);
});

test("equal glyph-like grids, unshifted headers, blank and transparent ink remain ambiguous", () => {
  for (const image of [frame({ equal: true }), frame({ offsetHeader: false }), frame({ alpha: 0 }),
    { ...frame(), rgba: Buffer.alloc(200 * 160 * 4, 255) }]) {
    assert.equal(framedGraphicEvidence(image, box), null);
    assert.equal(boundedOcrSourceDeck(request(image)).pages[0].textBoxes.length, 5);
  }
  for (const value of [request(frame(), 0.35), request(frame(), 0.9), request(frame(), 0.28, "QQ"),
    { ...request(), sourceRaster: undefined }, { ...request(), preserveUncertainGlyphs: false }]) {
    assert.equal(boundedOcrSourceDeck(value).pages[0].textBoxes.length, 5);
  }
});

test("frame evidence rejects malformed, excessive and unsafe geometry without coercion", () => {
  let coerced = false;
  for (const value of [null, {}, { ...box, x: -1 }, { ...box, h: Infinity },
    { ...box, w: { valueOf() { coerced = true; return 88; } } }, { ...box, x: 190 }]) {
    assert.equal(framedGraphicEvidence(frame(), value), null);
  }
  for (const image of [null, { ...frame(), width: 0 }, { ...frame(), rgba: Buffer.alloc(4) }]) assert.equal(framedGraphicEvidence(image, box), null);
  const large = { width: 600, height: 600, rgba: Buffer.alloc(600 * 600 * 4, 255) };
  assert.equal(framedGraphicEvidence(large, { x: 0, y: 0, w: 600, h: 600 }), null);
  assert.equal(coerced, false);
});

test("overlapping frame candidates remain within the aggregate admission scan budget", () => {
  const value = request();
  const candidate = value.ocr.lines[4];
  value.ocr.lines = value.ocr.lines.slice(0, 4).concat(Array.from({ length: 400 }, () => ({ ...candidate })));
  const admitted = boundedOcrSourceDeck(value);
  const paddedPixels = (box.w + 18) * (box.h + 18);
  assert.equal(admitted.meta.ocrAdmission.rasterFallbackGlyphs, Math.floor(4_000_000 / paddedPixels));
  assert.equal(admitted.pages[0].textBoxes.length, 404 - admitted.meta.ocrAdmission.rasterFallbackGlyphs);
});

test("admitted frame graphics become bounded native contours, preserving header and body text", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-frame-native-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"); writePng(sourceFile, frame());
  const original = boundedOcrSourceDeck({ ...request(), preserveUncertainGlyphs: false });
  const admitted = boundedOcrSourceDeck(request());
  const glyphs = original.pages[0].textBoxes.filter(item => !admitted.pages[0].textBoxes.some(other => other.id === item.id));
  const page = original.pages[0];
  const restored = restoreOcrGlyphResiduals({ page, slideSize: original.slideSize, sourceFile, root, glyphs });
  assert.equal(restored.restoredGlyphs, 1); assert.equal(restored.nativeGlyphs, 1);
  assert.equal(page.images.length, 0); assert.equal(page.textBoxes.length, 4);
  assert.ok(page.shapes.length > 0);
  assert.ok(page.shapes.every(s => s.type === "freeform" && s.source.detector === "ocr-framed-graphic-native-contour"
    && s.source.editable === true && s.style.freeformSegments.length <= 120));
});

test("removed frame overlays recover from source evidence but reject identity transfer and blank pixels", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-frame-removed-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"); writePng(sourceFile, frame());
  const original = boundedOcrSourceDeck({ ...request(), preserveUncertainGlyphs: false });
  const admitted = boundedOcrSourceDeck(request());
  const glyphs = original.pages[0].textBoxes.filter(item => !admitted.pages[0].textBoxes.some(other => other.id === item.id));
  const page = structuredClone(admitted.pages[0]);
  const body = structuredClone(page.textBoxes);
  const input = { page, slideSize: original.slideSize, sourceFile, root, glyphs };
  assert.deepEqual(restoreOcrGlyphResiduals(input), { restoredGlyphs: 1, nativeGlyphs: 1 });
  assert.deepEqual(page.textBoxes, body);
  assert.equal(page.images.length, 0);
  assert.ok(page.shapes.length > 0);
  for (const collection of ["images", "shapes"]) {
    const collision = structuredClone(admitted.pages[0]);
    collision[collection].push({ id: glyphs[0].id, box: glyphs[0].box });
    const before = structuredClone(collision);
    assert.throws(() => restoreOcrGlyphResiduals({ ...input, page: collision }), /ids are invalid/u);
    assert.deepEqual(collision, before);
  }
  writePng(sourceFile, { ...frame(), rgba: Buffer.alloc(200 * 160 * 4, 255) });
  const blank = structuredClone(admitted.pages[0]), before = structuredClone(blank);
  assert.throws(() => restoreOcrGlyphResiduals({ ...input, page: blank }), /ids are invalid/u);
  assert.deepEqual(blank, before);
  assert.deepEqual(fs.readdirSync(path.join(root, "assets")), []);
});
