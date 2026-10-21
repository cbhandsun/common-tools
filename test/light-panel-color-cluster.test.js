"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { clusterLightPanelBins } = require("../packages/slideclone-worker-adapter/light-panel-color-cluster");
const { fitDeckLowSaturationPanelFills } = require("../packages/slideclone-worker-adapter/team-worker");
const bin = (r, g, b, count = 100) => ({ r: r * count, g: g * count, b: b * count, count });

test("adjacent pale bins combine only with strong aggregate color consensus", () => {
  const bins = [];
  for (const r of [239, 240]) for (const g of [239, 240]) for (const b of [239, 240]) bins.push(bin(r, g, b));
  const input = { bins, sampled: 800 }, before = structuredClone(input);
  assert.deepEqual(clusterLightPanelBins(input), { r: 239.5, g: 239.5, b: 239.5 });
  assert.deepEqual(input, before);
  assert.equal(clusterLightPanelBins({ bins: [bin(180, 180, 180), bin(245, 245, 245)], sampled: 200 }), null);
});

test("color clustering refuses missing, malformed, ambiguous, unsafe and extreme evidence", () => {
  for (const input of [null, {}, { bins: [], sampled: 0 }, { bins: new Array(4097), sampled: 800 },
    { bins: [bin(239, 239, 239)], sampled: 99 }, { bins: [bin(239, 239, 239)], sampled: Infinity },
    { bins: [bin(239, 239, 239)], sampled: 2_000_001 }, { bins: [bin(239, 239, 239, -1)], sampled: 100 },
    { bins: [bin(239, 239, 239), bin(239, 239, 239)], sampled: 200 },
    { bins: [bin(0, 0, 0)], sampled: 100 }, { bins: [bin(255, 255, 255)], sampled: 100 },
    { bins: [bin(255, 100, 100)], sampled: 100 }, { bins: [{ ...bin(239, 239, 239), r: NaN }], sampled: 100 },
    { bins: [{ ...bin(239, 239, 239), r: "23900" }], sampled: 100 }]) assert.equal(clusterLightPanelBins(input), null);
});

test("worker fits textured native panel fill split across quantization boundaries without touching geometry", () => {
  const width = 100, rgba = Buffer.alloc(width * width * 4, 255);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4, mode = (x + y * width) % 8;
    rgba[offset] = 239 + (mode & 1); rgba[offset + 1] = 239 + ((mode >> 1) & 1); rgba[offset + 2] = 239 + ((mode >> 2) & 1);
  }
  const shape = { id: "textured-container", type: "roundRect", box: { x: 10, y: 10, w: 80, h: 80 },
    style: { fill: "#F8FAFC", stroke: "#DDEEFF", radiusPt: 8 },
    source: { editable: true, nativeRebuild: true, semanticNativeStructure: true, preserveResidualInterior: true } };
  const deck = { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ shapes: [shape] }] };
  const result = fitDeckLowSaturationPanelFills(deck, { pageImages: [{ width, height: width, rgba }] });
  assert.equal(result.changedShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.fill.toUpperCase(), "#F0F0F0");
  assert.deepEqual(result.deck.pages[0].shapes[0].box, shape.box);
  assert.equal(result.deck.pages[0].shapes[0].style.radiusPt, 8);
  assert.equal(shape.style.fill, "#F8FAFC");
});
