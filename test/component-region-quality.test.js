"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildComponentRegions, compareComponentRegions } = require("../packages/slideclone-core/component-region-quality");

function image(width, height, color = 255) { return { width, height, rgba: Buffer.alloc(width * height * 4, color) }; }
function setPixel(target, x, y, rgba) { const offset = (y * target.width + x) * 4; rgba.forEach((value, index) => { target.rgba[offset + index] = value; }); }

test("component region quality identifies the worst editable object", () => {
  const source = image(20, 10); const generated = image(20, 10);
  setPixel(source, 2, 2, [0, 0, 0, 255]);
  setPixel(source, 15, 2, [0, 0, 0, 255]); setPixel(generated, 15, 2, [0, 0, 0, 255]);
  const regions = [{ id: "missing", kind: "text", box: { x: 0, y: 0, w: 10, h: 10 } }, { id: "matched", kind: "shape", box: { x: 10, y: 0, w: 10, h: 10 } }];
  const result = compareComponentRegions(source, generated, regions, { widthPt: 20, heightPt: 10 }, { threshold: 24, foregroundTolerancePx: 0, foregroundToleranceDelta: 0 });
  assert.equal(result.audited, 2);
  assert.equal(result.worst[0].id, "missing");
  assert.equal(result.worst[0].foregroundMissingRatio, 1);
  assert.equal(result.worst[1].foregroundMissingRatio, 0);
});

test("component region builder includes editable and fidelity objects with stable fallback ids", () => {
  const regions = buildComponentRegions({ textBoxes: [{ id: "title", box: { x: 1, y: 2, w: 3, h: 4 } }], shapes: [{ box: { x: 5, y: 6, w: 7, h: 8 } }], images: [{ id: "bad", box: { x: 0, y: 0, w: 0, h: 1 } }] }, { widthPt: 100, heightPt: 50 });
  assert.deepEqual(regions.map(({ id, kind }) => ({ id, kind })), [{ id: "title", kind: "text" }, { id: "shape-1", kind: "shape" }]);
});

test("component regions normalize signed and axis-aligned connectors without losing their endpoints", () => {
  const regions = buildComponentRegions({ shapes: [
    { id: "descending", type: "line", box: { x: 10, y: 8, w: -8, h: -6 }, style: { strokeWidthPt: 2, endArrow: "triangle" } },
    { id: "horizontal", type: "line", box: { x: 2, y: 5, w: 12, h: 0 }, style: { strokeWidthPt: 1 } },
  ] }, { widthPt: 20, heightPt: 10 });
  assert.equal(regions.length, 2);
  assert.equal(regions[0].role, "connector-straight");
  assert.deepEqual(
    { startX: regions[0].geometry.startX, startY: regions[0].geometry.startY, endX: regions[0].geometry.endX, endY: regions[0].geometry.endY },
    { startX: 10, startY: 8, endX: 2, endY: 2 },
  );
  assert.equal(regions[1].geometry.startY, regions[1].geometry.endY);
});

test("connector diagnostics sample a narrow geometry corridor and apply role baselines", () => {
  const source = image(24, 16); const generated = image(24, 16);
  for (let x = 4; x <= 12; x += 2) setPixel(source, x, 4, [0, 0, 0, 255]);
  setPixel(source, 10, 12, [0, 0, 0, 255]);
  const regions = buildComponentRegions({ shapes: [{ id: "route", type: "line", box: { x: 4, y: 4, w: 8, h: 0 }, style: { strokeWidthPt: 0.5 } }] }, { widthPt: 24, heightPt: 16 });
  const result = compareComponentRegions(source, generated, regions, { widthPt: 24, heightPt: 16 }, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 0,
    componentBaselines: { "connector-straight": { maximumPixelDiffRatio: 0.1, maximumForegroundMissingRatio: 0.1, minimumForegroundPixels: 1 } },
  });
  assert.equal(result.worst[0].foregroundPixels, 5);
  assert.equal(result.worst[0].attention, true);
  assert.equal(result.attentionCount, 1);
  assert.equal(result.roles[0].role, "connector-straight");
});

test("component region quality rejects invalid boundaries and excessive input", () => {
  assert.throws(() => buildComponentRegions({}, {}), /invalid/u);
  assert.throws(() => buildComponentRegions({ shapes: Array.from({ length: 5001 }, (_, index) => ({ id: String(index), box: { x: index, y: 0, w: 1, h: 1 } })) }, { widthPt: 10000, heightPt: 10 }), /safety limit/u);
  assert.throws(() => compareComponentRegions(image(1, 1), image(1, 1), [], { widthPt: 1, heightPt: 1 }, { foregroundTolerancePx: 9 }), /options/u);
  assert.throws(() => compareComponentRegions(image(1, 1), image(1, 1), [{ id: "x", kind: "shape", role: "shape", box: { x: 0, y: 0, w: 1, h: 1 } }], { widthPt: 1, heightPt: 1 }, { componentBaselines: { shape: { maximumPixelDiffRatio: 2 } } }), /baseline/u);
});
