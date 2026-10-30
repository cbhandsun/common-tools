"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitSourceSemanticCurves } = require("../packages/slideclone-core/scene-plan/source-semantic-curves");
const { admitSemanticArcs } = require("../packages/slideclone-core/archetypes/semantic-arc-admission");
function blank() { return { width: 480, height: 360, rgba: Buffer.alloc(480 * 360 * 4, 255) }; }
function paint(image, x, y, rgb) {
  for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
    if (dx * dx + dy * dy > 4) continue;
    const px = Math.round(x) + dx, py = Math.round(y) + dy;
    if (px >= 0 && py >= 0 && px < image.width && py < image.height) image.rgba.set([...rgb, 255], (py * image.width + px) * 4);
  }
}
function bezier(image, points, rgb, first = 0, last = 1) {
  for (let i = Math.ceil(first * 1200); i <= Math.floor(last * 1200); i += 1) {
    const t = i / 1200, u = 1 - t;
    const x = u ** 3 * points[0].x + 3 * u ** 2 * t * points[1].x + 3 * u * t ** 2 * points[2].x + t ** 3 * points[3].x;
    const y = u ** 3 * points[0].y + 3 * u ** 2 * t * points[1].y + 3 * u * t ** 2 * points[2].y + t ** 3 * points[3].y;
    paint(image, x * 2, y * 2, rgb);
  }
}
function fixture(stroke = "#4F81E0", rgb = [0, 80, 235]) {
  const image = blank(), slideSize = { widthPt: 240, heightPt: 180 };
  const node = (id, x) => ({ id, type: "roundRect", box: { x, y: 45, w: 30, h: 30 }, source: { semanticNativeStructure: true, nativeComponentRole: "node" } });
  const arc = { id: "arbitrary-curve", type: "arc", box: { x: 40, y: 60, w: 145, h: 85 },
    style: { stroke, adjustments: [270, 360], strokeWidthPt: 1 },
    source: { semanticNativeStructure: true, nativeComponentRole: "relationship" } };
  const points = [{ x: 45, y: 75 }, { x: 45, y: 140 }, { x: 175, y: 140 }, { x: 175, y: 75 }];
  bezier(image, points, rgb);
  return { image, slideSize, shapes: [node("left-node", 30), node("right-node", 160), arc], points, rgb };
}
test("continuous U relation replaces guessed arc with one editable source contour without mutation", () => {
  const input = fixture(), original = structuredClone(input.shapes), pixels = Buffer.from(input.image.rgba);
  const result = fitSourceSemanticCurves(input);
  assert.equal(result.evidence.accepted, 1);
  const curve = result.shapes[2];
  assert.equal(curve.type, "freeform");
  assert.equal(curve.id, "arbitrary-curve");
  assert.ok(curve.style.freeformSegments.length <= 120);
  assert.equal(curve.style.stroke, "none");
  assert.deepEqual(curve.source.sourceSemanticCurveFit.sourceNodeIds, ["left-node", "right-node"]);
  assert.deepEqual(input.shapes, original);
  assert.deepEqual(input.image.rgba, pixels);
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: result.shapes }).evidence.accepted, 0);
  assert.equal(admitSemanticArcs({ ...input, page: { shapes: result.shapes } }).evidence.rejected, 0);
});
test("relation extraction is independent of fixed blue hue, labels and component identities", () => {
  for (const [stroke, rgb] of [["#D84C32", [210, 40, 10]], ["#298040", [17, 137, 34]], ["#202020", [24, 24, 24]]]) {
    const input = fixture(stroke, rgb);
    input.shapes[0].id = "custom-node-a"; input.shapes[1].id = "custom-node-b";
    assert.equal(fitSourceSemanticCurves(input).evidence.accepted, 1);
  }
});
test("reversed orientation retains both source node contacts", () => {
  const input = fixture(); input.image = blank();
  const reversed = input.points.map(point => ({ x: 240 - point.x, y: 180 - point.y }));
  bezier(input.image, reversed, input.rgb);
  input.shapes = input.shapes.map(shape => ({ ...shape, box: { ...shape.box, x: 240 - shape.box.x - shape.box.w, y: 180 - shape.box.y - shape.box.h } }));
  assert.equal(fitSourceSemanticCurves(input).evidence.accepted, 1);
});
test("two plausible independent routes are rejected instead of guessing ownership", () => {
  const input = fixture(); input.image = blank();
  input.shapes[0].box = { x: 20, y: 40, w: 30, h: 70 };
  input.shapes[1].box = { x: 170, y: 40, w: 30, h: 70 };
  input.shapes[2].box = { x: 40, y: 15, w: 145, h: 130 };
  bezier(input.image, [{ x: 50, y: 55 }, { x: 75, y: 10 }, { x: 145, y: 10 }, { x: 170, y: 55 }], input.rgb);
  bezier(input.image, [{ x: 50, y: 95 }, { x: 75, y: 145 }, { x: 145, y: 145 }, { x: 170, y: 95 }], input.rgb);
  assert.equal(fitSourceSemanticCurves(input).evidence.accepted, 0);
});
test("missing, disconnected, wrong-color and straight ink cannot repair a semantic arc", () => {
  for (const mode of ["blank", "disconnected", "wrong-color", "straight"]) {
    const input = fixture(); input.image = blank();
    if (mode === "disconnected") {
      bezier(input.image, input.points, input.rgb, 0, 0.3); bezier(input.image, input.points, input.rgb, 0.7, 1);
    }
    if (mode === "wrong-color") bezier(input.image, input.points, [220, 40, 20]);
    if (mode === "straight") bezier(input.image, [{ x: 45, y: 75 }, { x: 90, y: 75 }, { x: 130, y: 75 }, { x: 175, y: 75 }], input.rgb);
    const result = fitSourceSemanticCurves(input);
    assert.equal(result.evidence.accepted, 0, mode);
    assert.deepEqual(result.shapes, input.shapes);
  }
});
test("node interiors, one-node and unrelated pictorial ownership do not become relations", () => {
  const input = fixture();
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: input.shapes.slice(1) }).evidence.accepted, 0);
  const foreign = structuredClone(input.shapes); foreign[1].box = { x: 205, y: 10, w: 30, h: 30 };
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: foreign }).evidence.accepted, 0);
  const nonSemantic = structuredClone(input.shapes); nonSemantic[2].source.nativeComponentRole = "pictorial";
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: nonSemantic }).evidence.accepted, 0);
  const insideNode = structuredClone(input.shapes); insideNode[0].box = { x: 25, y: 70, w: 180, h: 80 };
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: insideNode }).evidence.accepted, 0);
});
test("malformed, duplicate, unsafe color, excessive and extreme input boundaries fail safely", () => {
  const input = fixture();
  for (const request of [null, {}, { ...input, shapes: Array(10001).fill(null) }, { ...input, image: { width: 40000, height: 1, rgba: Buffer.alloc(4) } },
    { ...input, slideSize: { widthPt: Infinity, heightPt: 180 } }]) assert.throws(() => fitSourceSemanticCurves(request), TypeError);
  assert.throws(() => fitSourceSemanticCurves({ ...input, shapes: [...input.shapes, input.shapes[0]] }), TypeError);
  const unsafe = structuredClone(input.shapes); unsafe[2].style.stroke = "url(secret)";
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: unsafe }).evidence.accepted, 0);
  const oversized = structuredClone(input.shapes); oversized[2].box = { x: 0, y: 0, w: 100000, h: 100000 };
  assert.equal(fitSourceSemanticCurves({ ...input, shapes: oversized }).evidence.accepted, 0);
  assert.deepEqual(fitSourceSemanticCurves({ ...input, shapes: [] }).shapes, []);
});
