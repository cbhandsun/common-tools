"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../packages/slideclone-core/png");
const { refineGrayBorderResiduals } = require("../packages/slideclone-core/gray-border-residual");

function fixture(t, imageCount = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gray-border-residual-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assets = path.join(root, "assets"); fs.mkdirSync(assets);
  const source = { width: 400, height: 400, rgba: Buffer.alloc(400 * 400 * 4, 255) };
  const pixel = (x, y) => source.rgba.set([167, 167, 167, 255], (y * 400 + x) * 4);
  for (let x = 100; x <= 200; x++) { pixel(x, 100); pixel(x, 160); }
  for (let y = 100; y <= 160; y++) { pixel(100, y); pixel(200, y); }
  const sourceFile = path.join(assets, "source.png"); writePng(sourceFile, source);
  const images = Array.from({ length: imageCount }, (_, index) => {
    const assetPath = `assets/layer-${index}.png`;
    writePng(path.join(root, assetPath), { width: 400, height: 400, rgba: Buffer.from(source.rgba) });
    return { id: `layer-${index}`, assetPath, box: { x: 0, y: 0, w: 400, h: 400 }, style: { assetPath, opacity: 0.8 }, source: { retained: true } };
  });
  const gray = { id: "team-knowledge-graph-node-2", type: "roundRect", box: { x: 108, y: 106, w: 86, h: 48 }, style: { stroke: "#A7A7A7", fill: "#FFFFFF" }, source: { semanticNativeStructure: true } };
  const page = { pageIndex: 0, shapes: [gray, { id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 100, y: 250, w: 100, h: 80 } }, { id: "team-knowledge-graph-translator-hub", type: "line", box: { x: 151, y: 154, w: -1, h: 96 }, source: { semanticNativeStructure: true } }], images };
  return { root, sourceFile, page, input: { page, slideSize: { widthPt: 400, heightPt: 400 }, sourceFile, root }, layerFiles: images.map(image => path.join(root, image.assetPath)) };
}

test("publishes only changed layers and atomically updates every image asset field", async (t) => {
  const value = fixture(t, 2); const beforeSource = fs.readFileSync(value.sourceFile); const beforeLayer = fs.readFileSync(value.layerFiles[0]);
  const evidence = await refineGrayBorderResiduals(value.input);
  assert.deepEqual(evidence, { acceptedNodes: 1, changedLayers: 2, changedPixels: 472 });
  assert.equal(value.page.images[0].assetPath, "assets/deck-p01-gray-border-001.png");
  assert.equal(value.page.images[0].style.assetPath, "assets/deck-p01-gray-border-001.png");
  assert.equal(value.page.images[1].assetPath, "assets/deck-p01-gray-border-002.png");
  assert.equal(value.page.images[1].style.assetPath, "assets/deck-p01-gray-border-002.png");
  assert.equal(value.page.images[0].style.opacity, 0.8);
  assert.deepEqual(fs.readFileSync(value.sourceFile), beforeSource);
  assert.deepEqual(fs.readFileSync(value.layerFiles[0]), beforeLayer);
  assert.equal(readPng(path.join(value.root, value.page.images[0].assetPath)).rgba[(120 * 400 + 100) * 4], 255);
});

test("no accepted nodes leaves every page field and file unchanged", async (t) => {
  const value = fixture(t); value.page.shapes[0].style.fill = "#00FF00";
  const beforePage = structuredClone(value.page); const before = fs.readdirSync(path.join(value.root, "assets")).sort();
  assert.deepEqual(await refineGrayBorderResiduals(value.input), { acceptedNodes: 0, changedLayers: 0, changedPixels: 0 });
  assert.deepEqual(value.page, beforePage); assert.deepEqual(fs.readdirSync(path.join(value.root, "assets")).sort(), before);
});

test("an asynchronous false cancellation callback does not cancel successful publication", async (t) => {
  const value = fixture(t);
  const evidence = await refineGrayBorderResiduals({ ...value.input, isCancellationRequested: async () => false });
  assert.deepEqual(evidence, { acceptedNodes: 1, changedLayers: 1, changedPixels: 236 });
  assert.equal(value.page.images[0].assetPath, "assets/deck-p01-gray-border-001.png");
});

test("failed publication and cancellation after the first publication roll back without touching page references", async (t) => {
  const value = fixture(t, 2); const before = structuredClone(value.page); const realLink = fs.linkSync; let links = 0;
  t.mock.method(fs, "linkSync", (...args) => { links += 1; if (links === 2) throw new Error("injected link failure"); return realLink(...args); });
  await assert.rejects(refineGrayBorderResiduals(value.input), /injected link failure/u);
  assert.deepEqual(value.page, before);
  assert.equal(fs.existsSync(path.join(value.root, "assets", "deck-p01-gray-border-001.png")), false);

  const cancelled = fixture(t); const cancelledBefore = structuredClone(cancelled.page);
  const firstTarget = path.join(cancelled.root, "assets", "deck-p01-gray-border-001.png"); let observedPublished = false;
  await assert.rejects(refineGrayBorderResiduals({
    ...cancelled.input,
    isCancellationRequested: async () => {
      observedPublished ||= fs.existsSync(firstTarget);
      return observedPublished;
    }
  }), /cancelled/u);
  assert.equal(observedPublished, true, "cancellation observed a successfully linked first target");
  assert.deepEqual(cancelled.page, cancelledBefore);
  assert.equal(fs.existsSync(firstTarget), false);
  assert.deepEqual(fs.readdirSync(path.join(cancelled.root, "assets")).filter(name => name.includes("gray-border") || name.endsWith(".tmp")), []);
});

test("skips OCR fallback layers and preserves their metadata while updating ordinary layers", async (t) => {
  const value = fixture(t); const fallback = { id: "ocr-fallback", source: { ocrGlyphFallback: true }, metadata: { keep: true } };
  value.page.images.push(fallback);
  assert.deepEqual(await refineGrayBorderResiduals(value.input), { acceptedNodes: 1, changedLayers: 1, changedPixels: 236 });
  assert.equal(value.page.images[1], fallback);
  assert.deepEqual(value.page.images[1], fallback);
});

test("rejects empty-invalid pages, collision, external paths, and symlinks without writes", async (t) => {
  const value = fixture(t); const before = structuredClone(value.page);
  await assert.rejects(refineGrayBorderResiduals({ ...value.input, page: null }), /page is invalid/u);
  const empty = { shapes: [], images: [] };
  assert.deepEqual(await refineGrayBorderResiduals({ ...value.input, page: empty }), { acceptedNodes: 0, changedLayers: 0, changedPixels: 0 });
  fs.writeFileSync(path.join(value.root, "assets", "deck-p01-gray-border-001.png"), "keep");
  await assert.rejects(refineGrayBorderResiduals(value.input), /already exists/u);
  assert.deepEqual(value.page, before);
  assert.equal(fs.readFileSync(path.join(value.root, "assets", "deck-p01-gray-border-001.png"), "utf8"), "keep");
  const external = path.join(os.tmpdir(), "outside.png"); value.page.images[0].assetPath = external;
  await assert.rejects(refineGrayBorderResiduals(value.input), /asset path is invalid/u);
  value.page.images[0].assetPath = "assets/layer-0.png";
  fs.rmSync(value.layerFiles[0]); fs.symlinkSync(value.sourceFile, value.layerFiles[0], "file");
  await assert.rejects(refineGrayBorderResiduals(value.input), /image layer is invalid/u);
});

test("enforces the aggregate layer-pixel limit before publishing any output", async (t) => {
  const value = fixture(t, 3); const large = { width: 5000, height: 3000, rgba: Buffer.alloc(5000 * 3000 * 4, 255) };
  for (const file of value.layerFiles) writePng(file, large);
  const before = structuredClone(value.page);
  await assert.rejects(refineGrayBorderResiduals(value.input), /layers exceed the processing boundary/u);
  assert.deepEqual(value.page, before);
  assert.equal(fs.existsSync(path.join(value.root, "assets", "deck-p01-gray-border-001.png")), false);
  assert.equal(fs.existsSync(path.join(value.root, "assets", "deck-p01-gray-border-002.png")), false);
  assert.equal(fs.existsSync(path.join(value.root, "assets", "deck-p01-gray-border-003.png")), false);
});
