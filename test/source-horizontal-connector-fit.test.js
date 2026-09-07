"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitSourceHorizontalConnectors } = require("../packages/slideclone-core/source-horizontal-connector-fit");

function image(width = 640, height = 720) { return { width, height, rgba: new Uint8Array(width * height * 4).fill(255) }; }
function pixel(im, x, y, color = [0, 120, 255], alpha = 255) { if (x >= 0 && y >= 0 && x < im.width && y < im.height) im.rgba.set([...color, alpha], (y * im.width + x) * 4); }
function arrow(im, left, right, y, color = [0, 120, 255]) {
  const apex = right;
  for (let x = left; x <= right - 6; x += 1) for (let dy = -1; dy <= 1; dy += 1) pixel(im, x, y + dy, color);
  for (let distance = 0; distance <= 6; distance += 1) for (let dy = -Math.floor(distance / 2); dy <= Math.floor(distance / 2); dy += 1) pixel(im, apex - distance, y + dy, color);
}
function line(id = "team-knowledge-graph-layer-flow-1", box = { x: 215, y: 572, w: 195, h: 0 }) {
  return { id, type: "line", box, style: { stroke: "#4F81E0", endArrow: "triangle", endArrowLength: "medium" }, source: { detector: id, semanticNativeStructure: true, retained: { object: true } } };
}
function run(im, shapes = [line()], slideSize = { widthPt: im.width, heightPt: im.height }) { return fitSourceHorizontalConnectors({ image: im, shapes, slideSize }); }

test("fits a nearby source arrow using source pixels and preserves nested references", () => {
  const im = image(); arrow(im, 250, 380, 584); const original = line(); const source = original.source;
  const out = run(im, [original]);
  assert.deepEqual(out.shapes[0].box, { x: 250, y: 584, w: 130, h: 0 });
  assert.notEqual(out.shapes[0], original); assert.equal(out.shapes[0].source, source); assert.equal(out.evidence.accepted, 1);
  assert.equal(out.evidence.connectors[0].sourceBox.y, 584); assert.equal(im.rgba[(584 * im.width + 250) * 4], 0);
});

test("fits scaled source images without fixed source coordinates", () => {
  const im = image(1280, 720); arrow(im, 500, 760, 584); const proposed = line("team-knowledge-graph-layer-flow-2", { x: 215, y: 286, w: 195, h: 0 });
  const out = run(im, [proposed], { widthPt: 640, heightPt: 360 });
  assert.deepEqual(out.shapes[0].box, { x: 250, y: 292, w: 130, h: 0 });
});

test("keeps non-targets and target candidates with invalid evidence by reference", () => {
  const im = image(); const target = line(); const wrong = { ...line("other"), id: "other", source: { detector: "other", semanticNativeStructure: true } }; const malformed = { ...line(), style: { stroke: "#4F81E0" } };
  const out = run(im, [target, wrong, malformed]);
  assert.equal(out.shapes[0], target); assert.equal(out.shapes[1], wrong); assert.equal(out.shapes[2], malformed); assert.equal(out.evidence.accepted, 0); assert.equal(out.evidence.candidates, 2);
  assert.deepEqual(run(im, []).shapes, []);
});

test("rejects wrong color, solid blocks, text-like fragments, transparent lines, and parallel ambiguity", () => {
  const cases = [
    (im) => arrow(im, 250, 380, 584, [220, 40, 40]),
    (im) => { for (let y = 576; y <= 592; y += 1) for (let x = 250; x <= 380; x += 1) pixel(im, x, y); },
    (im) => { for (let x = 250; x < 380; x += 7) for (let y = 581; y <= 587; y += 1) pixel(im, x, y); },
    (im) => { arrow(im, 250, 380, 584); for (let x = 250; x <= 380; x += 1) im.rgba[(584 * im.width + x) * 4 + 3] = 0; },
    (im) => { arrow(im, 250, 380, 578); arrow(im, 250, 380, 590); }
  ];
  for (const draw of cases) { const im = image(); draw(im); const proposed = line(); assert.equal(run(im, [proposed]).shapes[0], proposed); }
});

test("fails closed for malformed requests, extreme inputs, rotated or vertical boxes, and resource limits", () => {
  const im = image();
  assert.throws(() => fitSourceHorizontalConnectors(null), /request/);
  assert.throws(() => fitSourceHorizontalConnectors({ image: im, slideSize: { widthPt: 1, heightPt: 1 }, shapes: {} }), /shapes/);
  assert.throws(() => run({ width: 1, height: 1, rgba: new Uint8Array(3) }), /image/);
  assert.throws(() => fitSourceHorizontalConnectors({ image: { width: 16385, height: 1, rgba: new Uint8Array(4) }, slideSize: { widthPt: 1, heightPt: 1 }, shapes: [] }), /image/);
  assert.throws(() => run(im, Array.from({ length: 17 }, () => line())), /candidates/);
  const vertical = line(undefined, { x: 215, y: 572, w: 0, h: 4 }); const extreme = line(undefined, { x: 1e300, y: 1, w: 2, h: 0 });
  assert.equal(run(im, [vertical]).shapes[0], vertical); assert.equal(run(im, [extreme]).shapes[0], extreme);
  arrow(im, 250, 380, 584); for (const rotation of [10, "0"]) { const rotated = { ...line(), style: { ...line().style, rotationDeg: rotation } }; assert.equal(run(im, [rotated]).shapes[0], rotated); }
  assert.throws(() => fitSourceHorizontalConnectors({ image: im, slideSize: { widthPt: 1e-320, heightPt: 1 }, shapes: [] }), /slide size/);
});

test("preserves signed direction when fitting a left-pointing arrow", () => {
  const im = image();
  // Mirror the right-pointing helper so the triangle apex is on the left.
  const right = 380; const left = 250; for (let x = left + 6; x <= right; x += 1) for (let dy = -1; dy <= 1; dy += 1) pixel(im, x, 584 + dy);
  for (let distance = 0; distance <= 6; distance += 1) for (let dy = -Math.floor(distance / 2); dy <= Math.floor(distance / 2); dy += 1) pixel(im, left + distance, 584 + dy);
  const proposed = line(undefined, { x: 410, y: 572, w: -195, h: 0 }); const out = run(im, [proposed]);
  assert.deepEqual(out.shapes[0].box, { x: 380, y: 584, w: -130, h: 0 });
});
