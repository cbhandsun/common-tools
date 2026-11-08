"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fitSourceLightPanelGeometry } = require("../packages/slideclone-worker-adapter/source-light-panel-geometry");
const { fitDeckLightCardGeometry } = require("../packages/slideclone-worker-adapter/team-worker");

function fixture() {
  const width = 240, height = 200;
  const data = Buffer.alloc(width * height * 4, 255);
  for (let y = 35; y < 170; y++) for (let x = 30; x < 210; x++) {
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 235 + (x + y) % 3;
  }
  const shape = { id: "panel", type: "roundRect", box: { x: 26, y: 32, w: 188, h: 134 }, style: { fill: "#ECEEEE" },
    source: { editable: true, nativeRebuild: true, semanticNativeStructure: true, preserveResidualInterior: true } };
  return { shape, raster: { width, height, rgba: data }, slideSize: { widthPt: width, heightPt: height } };
}

test("source panel fit uses four pale transitions without modifying inputs", () => {
  const { shape, raster, slideSize } = fixture(), before = structuredClone(shape);
  const fitted = fitSourceLightPanelGeometry(shape, raster, slideSize);
  assert.ok(fitted);
  for (const [name, expected] of Object.entries({ x: 30, y: 35, w: 180, h: 135 })) assert.ok(Math.abs(fitted.box[name] - expected) <= 2);
  assert.equal(fitted.fittedEdges, 4);
  assert.deepEqual(shape, before);
});

test("invalid, empty, nonnative, transparent, absent and low contrast evidence fails closed", () => {
  const { shape, raster, slideSize } = fixture();
  for (const value of [null, {}, [], { ...raster, width: Infinity }, { ...raster, width: 20000 }, { ...raster, rgba: [] }, { ...raster, rgba: Buffer.alloc(1) }]) {
    assert.equal(fitSourceLightPanelGeometry(shape, value, slideSize), null);
  }
  for (const value of [null, {}, { ...shape, hidden: true }, { ...shape, source: {} }, { ...shape, style: { fill: "url(secret)" } }, { ...shape, box: { ...shape.box, x: NaN } }]) {
    assert.equal(fitSourceLightPanelGeometry(value, raster, slideSize), null);
  }
  assert.equal(fitSourceLightPanelGeometry(shape, raster, null), null);
  assert.equal(fitSourceLightPanelGeometry(shape, { ...raster, rgba: Buffer.alloc(raster.rgba.length, 255) }, slideSize), null);
  assert.equal(fitSourceLightPanelGeometry(shape, { ...raster, rgba: Buffer.alloc(raster.rgba.length) }, slideSize), null);
  const pale = Buffer.from(raster.rgba);
  for (let i = 0; i < pale.length; i += 4) if (pale[i] < 255) pale[i] = pale[i + 1] = pale[i + 2] = 254;
  assert.equal(fitSourceLightPanelGeometry(shape, { ...raster, rgba: pale }, slideSize), null);
});

test("semantic panel geometry enters existing Worker candidate path and leaves other objects alone", () => {
  const { shape, raster, slideSize } = fixture();
  const other = { ...shape, id: "ordinary", source: {} };
  const deck = { slideSize, pages: [{ shapes: [shape, other], textBoxes: [] }] };
  const fit = fitDeckLightCardGeometry(deck, { pageImages: [raster] });
  assert.equal(fit.changedShapes, 1);
  assert.deepEqual(fit.changedComponentKeys, ["0:panel"]);
  assert.equal(fit.deck.pages[0].shapes[0].source.finalLightPanelSourceGeometryFit.fittedEdges, 4);
  assert.deepEqual(fit.deck.pages[0].shapes[1], other);
  assert.deepEqual(deck.pages[0].shapes[0], shape);
});

test("missing edges, distant panels and multiple comparable transitions are not guessed", () => {
  const { shape, raster, slideSize } = fixture();
  const missing = Buffer.from(raster.rgba);
  for (let y = 140; y < raster.height; y++) for (let x = 30; x < 210; x++) {
    const i = (y * raster.width + x) * 4;
    missing[i] = missing[i + 1] = missing[i + 2] = 255;
  }
  assert.equal(fitSourceLightPanelGeometry(shape, { ...raster, rgba: missing }, slideSize), null);
  assert.equal(fitSourceLightPanelGeometry({ ...shape, box: { x: 60, y: 32, w: 150, h: 134 } }, raster, slideSize), null);
  const ambiguous = Buffer.from(raster.rgba);
  for (let y = 35; y < 170; y++) for (let x = 34; x < 42; x++) {
    const i = (y * raster.width + x) * 4;
    ambiguous[i] = ambiguous[i + 1] = ambiguous[i + 2] = 255;
  }
  assert.equal(fitSourceLightPanelGeometry({ ...shape, box: { ...shape.box, x: 34, w: 180 } }, { ...raster, rgba: ambiguous }, slideSize), null);
});
