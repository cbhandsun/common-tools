"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { fitSourceAxisInk } = require("../packages/slideclone-core/source-axis-ink-fit");
const { refineSourceNativeEdges } = require("../packages/slideclone-core/source-native-edge-refinement");

function fixture(vertical = false, color = [20, 70, 225, 255]) {
  const image = { width: 240, height: 180, rgba: Buffer.alloc(240 * 180 * 4, 255) };
  for (let axis = 78; axis <= 82; axis++) for (let along = 100; along < 150; along++) {
    const x = vertical ? axis : along, y = vertical ? along : axis;
    image.rgba.set(color, (y * image.width + x) * 4);
  }
  return { image, color: { r: 79, g: 129, b: 224 }, vertical, expected: 50, start: 20, length: vertical ? 160 : 200, window: 40 };
}

test("source shaft fitting recovers displaced shorter horizontal and vertical chromatic ink", () => {
  for (const vertical of [false, true]) {
    const input = fixture(vertical), before = Buffer.from(input.image.rgba);
    const result = fitSourceAxisInk(input);
    assert.deepEqual(result.fit, { coordinate: 80, start: 100, length: 50, thicknessPx: 5, color: { r: 20, g: 70, b: 225 } });
    assert.ok(result.samples <= 262144);
    assert.deepEqual(input.image.rgba, before);
  }
});

test("source shaft fitting rejects absent, gray, different hue, dense and competing evidence", () => {
  for (const color of [[255, 255, 255, 255], [80, 80, 80, 255], [225, 70, 20, 255], [20, 70, 225, 0]]) {
    assert.equal(fitSourceAxisInk(fixture(false, color)).fit, null);
  }
  const parallel = fixture();
  for (let x = 100; x < 150; x++) parallel.image.rgba.set([20, 70, 225, 255], (65 * 240 + x) * 4);
  assert.equal(fitSourceAxisInk(parallel).fit, null);
  const dense = fixture();
  for (let y = 70; y < 90; y++) for (let x = 100; x < 150; x++) dense.image.rgba.set([20, 70, 225, 255], (y * 240 + x) * 4);
  assert.equal(fitSourceAxisInk(dense).fit, null);
  assert.equal(fitSourceAxisInk({ ...fixture(), window: 10 }).fit, null);
});

test("source shaft fitting validates unknown input and enforces its scan budget", () => {
  for (const value of [null, {}, { ...fixture(), expected: Infinity }, { ...fixture(), window: 65 },
    { ...fixture(), length: 999 }, { ...fixture(), image: { ...fixture().image, rgba: Buffer.alloc(4) } },
    { ...fixture(), color: { r: "private-value", g: 70, b: 225 } }]) {
    assert.throws(() => fitSourceAxisInk(value), error => /Invalid axis/.test(error.message) && !error.message.includes("private-value"));
  }
  const image = { width: 3000, height: 129, rgba: Buffer.alloc(3000 * 129 * 4, 255) };
  assert.deepEqual(fitSourceAxisInk({ ...fixture(), image, expected: 64, start: 0, length: 3000, window: 64 }), { fit: null, samples: 0 });
});

test("source shaft fitting follows a continuous endpoint just beyond the initial projection", () => {
  const value = fixture();
  const fitted = fitSourceAxisInk({ ...value, start: 105, length: 44, expected: 80 });
  assert.equal(fitted.fit.start, 102);
  assert.equal(fitted.fit.length, 48);
  assert.ok(fitted.samples <= 262144);
});

test("semantic connector fallback retains signed direction and arrow ownership", () => {
  for (const vertical of [false, true]) for (const sign of [-1, 1]) {
    const shape = { id: "relation", type: "line", box: vertical
      ? { x: 75, y: sign < 0 ? 180 : 20, w: 0, h: sign * 160 }
      : { x: sign < 0 ? 220 : 20, y: 75, w: sign * 200, h: 0 },
    style: { stroke: "#4F81E0", connectorType: "straight", endArrow: "triangle" },
    source: { nativeRebuild: true, editable: true, semanticNativeStructure: true } };
    const image = { width: 2400, height: 1800, rgba: Buffer.alloc(2400 * 1800 * 4, 255) };
    for (let axis = 798; axis <= 802; axis++) for (let along = 1000; along < 1500; along++) {
      const x = vertical ? axis : along, y = vertical ? along : axis;
      image.rgba.set([20, 70, 225, 255], (y * image.width + x) * 4);
    }
    const before = structuredClone(shape);
    const result = refineSourceNativeEdges({ page: { shapes: [shape] }, slideSize: { widthPt: 240, heightPt: 180 }, image });
    assert.deepEqual(shape, before);
    assert.equal(result.evidence.linesRefined, 1);
    const fitted = result.page.shapes[0];
    assert.equal(fitted.style.endArrow, "triangle");
    assert.equal(fitted.style.strokeWidthPt, 0.5);
    assert.equal(vertical ? fitted.box.x : fitted.box.y, 80);
    assert.equal(vertical ? fitted.box.h : fitted.box.w, sign * 50);
    assert.equal(vertical ? fitted.box.y : fitted.box.x, sign < 0 ? 150 : 100);
  }
});
