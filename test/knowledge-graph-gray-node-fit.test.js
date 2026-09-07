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
