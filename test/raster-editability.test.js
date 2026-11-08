"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { largeRasterEditability, tileLargeReconstructionRasters } = require("../packages/slideclone-core/team-native-rebuild");
const { writePng } = require("../packages/slideclone-core/png");

const slideSize = { widthPt: 960, heightPt: 1280 };
const deck = (images) => ({ slideSize, pages: [{ images }] });
const image = (w, h, source = {}) => ({ box: { x: 0, y: 0, w, h }, source });

test("large reconstruction residuals fail editability even when visual fidelity is high", () => {
  assert.deepEqual(largeRasterEditability(deck([image(960, 1280, { fullSlideResidual: true })])), {
    passed: false, largeRasterCount: 1, largestAreaRatio: 1
  });
  const result = largeRasterEditability(deck([image(580, 610, { detector: "foreground-graphic-crop" })]));
  assert.equal(result.passed, false);
  assert.equal(result.largeRasterCount, 1);
});

test("small residuals and genuine large visual assets remain allowed", () => {
  assert.equal(largeRasterEditability(deck([])).passed, true);
  assert.equal(largeRasterEditability(deck([image(100, 100, { residualCrop: true })])).passed, true);
  assert.equal(largeRasterEditability(deck([image(960, 1280, { detector: "photo" })])).passed, true);
  assert.equal(largeRasterEditability(null).passed, true);
  assert.equal(largeRasterEditability(deck([image(Infinity, 100, { residualCrop: true })])).passed, true);
});

test("large local fidelity crops fail editability until they are native components", () => {
  const result = largeRasterEditability(deck([
    image(580, 220, { strategy: "local-fidelity-crop", iconCropRefined: true }),
    image(120, 120, { strategy: "local-fidelity-crop" })
  ]));
  assert.equal(result.passed, false);
  assert.equal(result.largeRasterCount, 1);
});

test("editability gate counts multiple medium reconstruction crops instead of only whole-slide rasters", () => {
  const result = largeRasterEditability(deck([
    image(960, 1280, { fullSlideResidual: true }),
    image(400, 310, { detector: "foreground-graphic-crop" }),
    image(320, 320, { residualCrop: true }),
    image(200, 300, { detector: "foreground-graphic-crop" }),
    image(960, 1280, { detector: "photo" })
  ]));
  assert.equal(result.largeRasterCount, 3);
  assert.equal(result.largestAreaRatio, 1);
  assert.equal(result.passed, false);
});

test("large reconstruction raster tiling removes oversized residuals without touching photos", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "large-raster-tiles-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  const rgba = Buffer.alloc(100 * 100 * 4, 255);
  writePng(path.join(root, "assets", "residual.png"), { width: 100, height: 100, rgba });
  writePng(path.join(root, "assets", "photo.png"), { width: 100, height: 100, rgba });
  const value = deck([
    { id: "residual", type: "fidelity-crop", assetPath: "assets/residual.png", box: { x: 0, y: 0, w: 960, h: 1280 }, source: { fullSlideResidual: true, pageText: "x".repeat(1000), layer: { nested: "analysis" } } },
    { id: "photo", type: "fidelity-crop", assetPath: "assets/photo.png", box: { x: 0, y: 0, w: 960, h: 1280 }, source: { detector: "photo" } }
  ]);
  const result = tileLargeReconstructionRasters(value, { root });
  assert.equal(result.tiledImages, 1);
  assert.equal(value.pages[0].images.some((item) => item.id === "photo"), true);
  assert.equal(value.pages[0].images.filter((item) => item.source?.tiledLargeRaster === true).length, result.createdTiles);
  assert.equal(value.pages[0].images.some((item) => item.source?.pageText || item.source?.layer), false);
  const gate = largeRasterEditability(value);
  assert.equal(gate.passed, false);
  assert.equal(gate.largeRasterCount, 1);
});

test("editability gate aggregates tiled reconstruction rasters by parent", () => {
  const result = largeRasterEditability(deck([
    image(260, 260, { residualCrop: true, tiledLargeRaster: true, parentLargeRasterId: "residual" }),
    image(260, 260, { residualCrop: true, tiledLargeRaster: true, parentLargeRasterId: "residual" }),
    image(120, 120, { residualCrop: true, tiledLargeRaster: true, parentLargeRasterId: "small" })
  ]));
  assert.equal(result.passed, false);
  assert.equal(result.largeRasterCount, 1);
});

