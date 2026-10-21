"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitKnowledgeGraphGrayNodes } = require("../packages/slideclone-core/knowledge-graph-gray-node-fit");
function fixture() {
  const image = { width: 400, height: 400, rgba: new Uint8Array(400 * 400 * 4).fill(255) };
  const pixel = (x, y) => image.rgba.set([167, 167, 167, 255], (y * 400 + x) * 4);
  for (let x = 100; x <= 200; x++) { pixel(x, 100); pixel(x, 160); }
  for (let y = 100; y <= 160; y++) { pixel(100, y); pixel(200, y); }
  const gray = { id: "team-knowledge-graph-node-2", type: "roundRect", box: { x: 108, y: 106, w: 86, h: 48 }, style: { stroke: "#A7A7A7", fill: "#FFFFFF" }, source: { semanticNativeStructure: true } };
  const hub = { id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 100, y: 250, w: 100, h: 80 } };
  const line = { id: "team-knowledge-graph-translator-hub", type: "line", box: { x: 151, y: 154, w: -1, h: 96 }, source: { semanticNativeStructure: true }, style: { endArrow: "triangle" } };
  const other = { id: "unrelated", box: { x: 1, y: 1, w: 10, h: 10 } };
  return { image, gray, hub, line, other, input: { image, slideSize: { widthPt: 400, heightPt: 400 }, shapes: [gray, hub, line, other] } };
}
test("source-fitted gray node reconnects its incident line and preserves unrelated objects", () => {
  const f = fixture(), before = Buffer.from(f.image.rgba), result = fitKnowledgeGraphGrayNodes(f.input);
  assert.equal(result.evidence.accepted, 1);
  assert.deepEqual(result.shapes[0].box, { x: 100, y: 100, w: 100, h: 60 });
  assert.deepEqual(result.borders, [{ left: 100, right: 200, top: 100, bottom: 160 }]);
  assert.deepEqual(result.shapes[2].box, { x: 150, y: 160, w: 0, h: 90 });
  assert.equal(result.shapes[0].source, f.gray.source);
  assert.equal(result.shapes[2].style, f.line.style);
  assert.equal(result.shapes[1], f.hub); assert.equal(result.shapes[3], f.other);
  assert.deepEqual(f.gray.box, { x: 108, y: 106, w: 86, h: 48 });
  assert.deepEqual(Buffer.from(f.image.rgba), before);
});

test("source-fitted blue knowledge graph node reconnects semantic relationship endpoints", () => {
  const image = { width: 500, height: 300, rgba: new Uint8Array(500 * 300 * 4).fill(255) };
  const pixel = (x, y) => image.rgba.set([98, 167, 210, 255], (y * 500 + x) * 4);
  for (let x = 300; x <= 430; x++) { pixel(x, 120); pixel(x, 172); }
  for (let y = 120; y <= 172; y++) { pixel(300, y); pixel(430, y); }
  const source = { semanticNativeStructure: true, detector: "team-knowledge-graph-node-5" };
  const node = { id: "team-knowledge-graph-node-5", type: "roundRect", box: { x: 310, y: 126, w: 104, h: 39 }, style: { stroke: "#62A7D2", fill: "#FFFFFF" }, source };
  const line = { id: "team-knowledge-graph-hub-link-5", type: "line", box: { x: 180, y: 146, w: 130, h: 0 }, style: { endArrow: "triangle" }, source: { semanticNativeStructure: true, detector: "team-knowledge-graph-hub-link-5" } };

  const result = fitKnowledgeGraphGrayNodes({ image, slideSize: { widthPt: 500, heightPt: 300 }, shapes: [node, line] });

  assert.equal(result.evidence.accepted, 1);
  assert.deepEqual(result.shapes[0].box, { x: 300, y: 120, w: 130, h: 52 });
  assert.ok(Math.abs(result.shapes[1].box.x + result.shapes[1].box.w - 300) <= 0.001);
  assert.deepEqual(node.box, { x: 310, y: 126, w: 104, h: 39 });
});

test("source-fitted first knowledge graph node is eligible only when it is rectangular", () => {
  const image = { width: 260, height: 180, rgba: new Uint8Array(260 * 180 * 4).fill(255) };
  const pixel = (x, y) => image.rgba.set([20, 115, 230, 255], (y * 260 + x) * 4);
  for (let x = 70; x <= 170; x++) { pixel(x, 60); pixel(x, 130); }
  for (let y = 60; y <= 130; y++) { pixel(70, y); pixel(170, y); }
  const source = { semanticNativeStructure: true, detector: "team-knowledge-graph-node-1" };
  const rectangular = { id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 78, y: 68, w: 84, h: 54 }, style: { stroke: "#1473E6", fill: "#FFFFFF" }, source };
  const fitted = fitKnowledgeGraphGrayNodes({ image, slideSize: { widthPt: 260, heightPt: 180 }, shapes: [rectangular] });
  assert.equal(fitted.evidence.accepted, 1);
  assert.deepEqual(fitted.shapes[0].box, { x: 70, y: 60, w: 100, h: 70 });

  const ellipse = { ...rectangular, type: "ellipse" };
  const retained = fitKnowledgeGraphGrayNodes({ image, slideSize: { widthPt: 260, heightPt: 180 }, shapes: [ellipse] });
  assert.equal(retained.evidence.accepted, 0);
  assert.equal(retained.shapes[0], ellipse);
});

test("source-backed knowledge graph node accepts thick one-sided border evidence", () => {
  const image = { width: 260, height: 180, rgba: new Uint8Array(260 * 180 * 4).fill(255) };
  const paint = (x, y) => image.rgba.set([98, 167, 210, 255], (y * 260 + x) * 4);
  for (let y = 40; y <= 130; y += 1) {
    for (let x = 50; x <= 55; x += 1) paint(x, y);
    for (let x = 185; x <= 190; x += 1) paint(x, y);
  }
  for (let x = 50; x <= 190; x += 1) {
    for (let y = 40; y <= 45; y += 1) paint(x, y);
    for (let y = 125; y <= 130; y += 1) paint(x, y);
  }
  const source = { semanticNativeStructure: true, detector: "team-knowledge-graph-node-5" };
  const node = { id: "team-knowledge-graph-node-5", type: "roundRect", box: { x: 64, y: 54, w: 112, h: 62 }, style: { stroke: "#62A7D2", fill: "#FFFFFF" }, source };
  const line = { id: "team-knowledge-graph-link-5", type: "line", box: { x: 10, y: 85, w: 54, h: 0 }, source: { semanticNativeStructure: true, detector: "team-knowledge-graph-link-5" } };

  const result = fitKnowledgeGraphGrayNodes({ image, slideSize: { widthPt: 260, heightPt: 180 }, shapes: [node, line] });

  assert.equal(result.evidence.accepted, 1);
  assert.ok(result.evidence.samples > 0);
  assert.ok(result.shapes[0].box.x <= 56);
  assert.ok(result.shapes[0].box.y <= 46);
  assert.ok(result.shapes[0].box.x + result.shapes[0].box.w >= 184);
  assert.ok(result.shapes[0].box.y + result.shapes[0].box.h >= 124);
  assert.ok(Math.abs(result.shapes[1].box.x + result.shapes[1].box.w - result.shapes[0].box.x) <= 0.001);
});

test("missing source support, rotated nodes and unowned connectors are retained", () => {
  for (const mode of ["empty", "rotated", "unowned", "colored-fill"]) {
    const f = fixture();
    if (mode === "empty") f.image.rgba.fill(255);
    if (mode === "rotated") f.gray.style.rotationDeg = 15;
    if (mode === "colored-fill") f.gray.style.fill = "#FF0000";
    if (mode === "unowned") f.line.source.semanticNativeStructure = false;
    const result = fitKnowledgeGraphGrayNodes(f.input);
    assert.equal(result.shapes[2], f.line);
    if (mode !== "unowned") { assert.equal(result.shapes[0], f.gray); assert.equal(result.evidence.accepted, 0); }
  }
});
test("gray fit rejects malformed, oversized and ambiguous input without private data", () => {
  const f = fixture();
  for (const input of [null, {}, { ...f.input, shapes: {} }, { ...f.input, shapes: Array(10001) }, { ...f.input, shapes: [f.gray, f.gray] }, { ...f.input, image: { width: 1e300, height: 1, rgba: [] } }]) {
    assert.throws(() => fitKnowledgeGraphGrayNodes(input));
  }
  assert.deepEqual(fitKnowledgeGraphGrayNodes({ ...f.input, shapes: [] }).borders, []);
  for (const duplicate of [f.hub, f.line]) assert.throws(() => fitKnowledgeGraphGrayNodes({ ...f.input, shapes: [...f.input.shapes, duplicate] }), /ambiguous/);
});

test("gray fit rejects invalid raster and slide bounds without mutating source objects", () => {
  const f = fixture();
  const beforeShapes = structuredClone(f.input.shapes);
  const beforePixels = Buffer.from(f.image.rgba);
  for (const image of [
    { ...f.image, width: 0 },
    { ...f.image, width: 400.5 },
    { ...f.image, width: "400" },
    { ...f.image, width: Infinity },
    { ...f.image, width: 16385 },
    { ...f.image, width: 10000, height: 10000 },
    { ...f.image, rgba: new Uint8Array(4) },
    { ...f.image, rgba: new Uint16Array(400 * 400 * 4) }
  ]) assert.throws(() => fitKnowledgeGraphGrayNodes({ ...f.input, image }));
  for (const widthPt of [0, -1, NaN, Infinity]) {
    assert.throws(() => fitKnowledgeGraphGrayNodes({ ...f.input, slideSize: { widthPt, heightPt: 400 } }));
  }
  assert.deepEqual(f.input.shapes, beforeShapes);
  assert.deepEqual(Buffer.from(f.image.rgba), beforePixels);
});
