"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writePng } = require("../packages/slideclone-core/png");
const { admitsSemanticPanelFill } = require("../packages/slideclone-worker-adapter/semantic-panel-fill-policy");
const { fitDeckLowSaturationPanelFills, tryBuildFinalLowSaturationPanelFillCandidate } = require("../packages/slideclone-worker-adapter/team-worker");

const slideSize = { widthPt: 100, heightPt: 100 };
function panel() {
  return { id: "generic-container", type: "roundRect", box: { x: 10, y: 10, w: 80, h: 80 },
    style: { fill: "#F8FAFC", stroke: "#DDEEFF" },
    source: { editable: true, nativeRebuild: true, semanticNativeStructure: true, preserveResidualInterior: true } };
}

test("semantic panel admission needs no detector or domain-specific owner", () => {
  assert.equal(admitsSemanticPanelFill(panel(), slideSize), true);
  assert.equal(admitsSemanticPanelFill({ ...panel(), type: "rect" }, slideSize), true);
});

test("semantic panel admission rejects missing evidence and non-native content", () => {
  for (const key of ["editable", "nativeRebuild", "semanticNativeStructure", "preserveResidualInterior"]) {
    const shape = panel(); shape.source[key] = false;
    assert.equal(admitsSemanticPanelFill(shape, slideSize), false, key);
  }
  for (const type of ["line", "freeform", "image", "text"]) assert.equal(admitsSemanticPanelFill({ ...panel(), type }, slideSize), false);
  for (const value of [null, undefined, [], {}, "panel"]) assert.equal(admitsSemanticPanelFill(value, slideSize), false);
});

test("semantic panel admission rejects invalid geometry, small regions, hidden and unsafe styles", () => {
  for (const box of [{ x: -1 }, { w: 0 }, { w: 101 }, { h: Infinity }, { x: NaN }, { h: "80" }, { w: 10 }]) {
    const shape = panel(); Object.assign(shape.box, box);
    assert.equal(admitsSemanticPanelFill(shape, slideSize), false);
  }
  assert.equal(admitsSemanticPanelFill(panel(), { widthPt: 1e9, heightPt: 1e9 }), false);
  assert.equal(admitsSemanticPanelFill(panel(), { widthPt: 0, heightPt: 100 }), false);
  assert.equal(admitsSemanticPanelFill({ ...panel(), hidden: true }, slideSize), false);
  for (const style of [{ fill: "url(secret)" }, { fill: "#000000" }, { fill: "#FFAAAA" }, { fillOpacity: 0 }, { opacity: 0.5 }]) {
    const shape = panel(); Object.assign(shape.style, style);
    assert.equal(admitsSemanticPanelFill(shape, slideSize), false);
  }
});

test("worker fits generic native panel fills without mutation and rejects insufficient raster evidence", () => {
  const rgba = Buffer.alloc(100 * 100 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 239; rgba[i + 1] = 241; rgba[i + 2] = 240; rgba[i + 3] = 255; }
  const image = { width: 100, height: 100, rgba };
  const shape = panel();
  const deck = { slideSize, pages: [{ shapes: [shape] }] };
  const result = fitDeckLowSaturationPanelFills(deck, { pageImages: [image] });
  assert.equal(result.changedShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.fill.toUpperCase(), "#EFF1F0");
  assert.equal(result.deck.pages[0].shapes[0].style.stroke, shape.style.stroke);
  assert.equal(shape.style.fill, "#F8FAFC");
  assert.equal(fitDeckLowSaturationPanelFills(deck, { pageImages: [] }).changedShapes, 0);
  rgba.fill(0);
  assert.equal(fitDeckLowSaturationPanelFills(deck, { pageImages: [image] }).changedShapes, 0);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 10; rgba[i + 1] = 20; rgba[i + 2] = 30; rgba[i + 3] = 255; }
  assert.equal(fitDeckLowSaturationPanelFills(deck, { pageImages: [image] }).changedShapes, 0);
});

test("panel fill search keeps fixed reference quality and cleans up a rejected candidate", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-panel-fill-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rgba = Buffer.alloc(100 * 100 * 4, 240);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  const source = path.join(root, "source.png");
  writePng(source, { width: 100, height: 100, rgba });
  const baseline = { passed: false, checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": 0.10, "foreground-missing-ratio": 0.05, "mean-absolute-delta": 14
  } };
  let attempts = 0;
  const result = await tryBuildFinalLowSaturationPanelFillCandidate({ root,
    metadata: { generatedDeck: { slideSize, pages: [{ shapes: [panel()] }] } },
    sourceImages: [source], visualQuality: baseline, isCancellationRequested: async () => false,
    runBuild: async () => {}, rawImageQualityVerifier: async input => {
      assert.equal(input.referenceQuality, baseline);
      attempts++;
      return { ...baseline, metrics: { ...baseline.metrics, "foreground-missing-ratio": 0.08 } };
    } });
  assert.equal(attempts, 1);
  assert.equal(result.accepted, false);
  assert.deepEqual(fs.readdirSync(root), ["source.png"]);
});
