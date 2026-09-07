"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fitKnowledgeGraphRelations,
} = require("../packages/slideclone-core/knowledge-graph-relation-fit");

function fixture({ lower = true } = {}) {
  const image = {
    width: 1400,
    height: 800,
    rgba: new Uint8Array(1400 * 800 * 4).fill(255),
  };
  const pixel = (x, y, rgb) => {
    if (x >= 0 && y >= 0 && x < image.width && y < image.height)
      image.rgba.set([...rgb, 255], (y * image.width + x) * 4);
  };
  const gray = [167, 167, 167],
    blue = [79, 129, 224];
  const node = (id, x, y, w, h) => ({
    id: `team-knowledge-graph-node-${id}`,
    type: "roundRect",
    box: { x, y, w, h },
    style: { stroke: "#A7A7A7", fill: "#FFFFFF" },
    source: { semanticNativeStructure: true },
  });
  const nodes = [
    node(3, 700, 200, 100, 60),
    node(4, 700, 350, 100, 90),
    node(5, 1075, 350, 154, 90),
  ];
  for (const n of nodes) {
    const b = n.box;
    for (let x = b.x; x <= b.x + b.w; x++) {
      pixel(x, b.y, gray);
      pixel(x, b.y + b.h, gray);
    }
    for (let y = b.y; y <= b.y + b.h; y++) {
      pixel(b.x, y, gray);
      pixel(b.x + b.w, y, gray);
    }
  }
  for (let i = 0; i <= 64; i++) {
    const t = (i * Math.PI) / 128;
    pixel(
      Math.round(800 + 352 * Math.sin(t)),
      Math.round(230 + 120 * (1 - Math.cos(t))),
      blue,
    );
  }
  if (lower) {
    for (let x = 804; x <= 1142; x++) pixel(x, 440, blue);
    for (let x = 1144; x <= 1149; x++) pixel(x, 441, blue);
    for (let x = 1144; x <= 1147; x++) pixel(x, 442, blue);
    for (let x = 1144; x <= 1145; x++) pixel(x, 443, blue);
  }
  const arc = (id) => ({
    id: `team-knowledge-graph-${id}`,
    type: "arc",
    box: { x: 1, y: 1, w: 10, h: 10 },
    style: {
      shapeType: "arc",
      stroke: "#4F81E0",
      fill: "none",
      adjustments: [0, 180],
      startArrow: "triangle",
    },
    source: { semanticNativeStructure: true },
  });
  return {
    image,
    nodes,
    arcs: [arc("right-high-target"), arc("right-work-target-lower")],
    input: {
      image,
      slideSize: { widthPt: 1400, heightPt: 800 },
      shapes: [
        ...nodes,
        arc("right-high-target"),
        arc("right-work-target-lower"),
      ],
    },
  };
}
test("fits only source-supported upper arc and lower directed relationship", () => {
  const f = fixture(),
    before = Buffer.from(f.image.rgba),
    result = fitKnowledgeGraphRelations(f.input);
  assert.deepEqual(result.evidence, {
    upperAccepted: true,
    lowerAccepted: true,
    samples: result.evidence.samples,
  });
  assert.ok(result.evidence.samples > 0);
  const upper = result.shapes[3],
    lower = result.shapes[4];
  assert.equal(upper.type, "arc");
  assert.deepEqual(upper.style.adjustments, [270, 360]);
  assert.equal(lower.type, "line");
  assert.equal(lower.style.endArrow, "triangle");
  assert.equal(lower.style.connectorType, "straight");
  assert.equal("startArrow" in lower.style, false);
  assert.equal("shapeType" in lower.style, false);
  assert.ok(
    Math.abs(lower.box.x - 800) <= 1 &&
      Math.abs(lower.box.x + lower.box.w - 1152) <= 1,
  );
  assert.deepEqual(Buffer.from(f.image.rgba), before);
});
test("plain horizontal evidence cannot replace the lower arc", () => {
  const f = fixture({ lower: false });
  for (let x = 804; x <= 1142; x++)
    f.image.rgba.set([79, 129, 224, 255], (440 * f.image.width + x) * 4);
  const result = fitKnowledgeGraphRelations(f.input);
  assert.equal(result.evidence.lowerAccepted, false);
  assert.equal(result.shapes[4], f.input.shapes[4]);
});
test("rejects invalid and ambiguous bounded input", () => {
  const f = fixture();
  for (const bad of [
    null,
    {},
    { ...f.input, shapes: Array(2001) },
    { ...f.input, image: { width: 1, height: 1, rgba: new Uint8Array() } },
    { ...f.input, shapes: [...f.input.shapes, f.input.shapes[3]] },
    { ...f.input, shapes: [...f.input.shapes, f.input.shapes[2]] },
    { ...f.input, slideSize: { widthPt: Number.MIN_VALUE, heightPt: 800 } },
    { ...f.input, slideSize: { widthPt: Infinity, heightPt: 800 } },
    { ...f.input, slideSize: { widthPt: 100001, heightPt: 800 } },
    { ...f.input, image: { width: 16385, height: 1, rgba: new Uint8Array(16385 * 4) } },
    { ...f.input, image: { width: 10000, height: 10000, rgba: new Uint8Array() } },
  ])
    assert.throws(() => fitKnowledgeGraphRelations(bad));
  assert.deepEqual(
    fitKnowledgeGraphRelations({ ...f.input, shapes: [] }).evidence,
    { upperAccepted: false, lowerAccepted: false, samples: 0 },
  );
});

test("unsupported or missing relations do not scan and preserve input objects", () => {
  for (const patch of [{ style: { shapeType: "arc", stroke: "#FF0000" } }, { source: { semanticNativeStructure: false } }, { type: "line" }]) {
    const f = fixture();
    const shapes = f.input.shapes.map(item => item.type === "arc" ? { ...item, ...patch } : item);
    const result = fitKnowledgeGraphRelations({ ...f.input, shapes });
    assert.deepEqual(result.evidence, { upperAccepted: false, lowerAccepted: false, samples: 0 });
    assert.ok(result.shapes.every((item, index) => item === shapes[index]));
  }
  const f = fixture();
  assert.equal(fitKnowledgeGraphRelations({ ...f.input, shapes: f.nodes }).evidence.samples, 0);
});

test("blank source cannot admit either relationship", () => {
  const f = fixture();
  f.image.rgba.fill(255);
  const result = fitKnowledgeGraphRelations(f.input);
  assert.equal(result.evidence.upperAccepted, false);
  assert.equal(result.evidence.lowerAccepted, false);
  assert.equal(result.shapes[3], f.input.shapes[3]);
  assert.equal(result.shapes[4], f.input.shapes[4]);
});

test("out-of-slide seeds and excessive sampling fail without mutating input", () => {
  const f = fixture();
  f.input.shapes[2].box.x = 1399;
  assert.throws(() => fitKnowledgeGraphRelations(f.input), /outside slide/u);
  const wide = fixture();
  wide.input.image = { width: 4000, height: 800, rgba: new Uint8Array(4000 * 800 * 4).fill(255) };
  wide.input.slideSize.widthPt = 4000;
  wide.input.shapes[2].box.x = 3800;
  const before = JSON.stringify(wide.input.shapes);
  assert.throws(() => fitKnowledgeGraphRelations(wide.input), /sampling limit/u);
  assert.equal(JSON.stringify(wide.input.shapes), before);
});
