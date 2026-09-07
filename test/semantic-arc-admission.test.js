// @ts-check
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { admitSemanticArcs } = require("../packages/slideclone-core/semantic-arc-admission");

/** @param {number} width @param {number} height @param {[number, number, number, number]} [color] */
function imageOf(width, height, color = [255, 255, 255, 255]) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(color, offset);
  return { width, height, rgba };
}

/** @param {{ width: number, height: number, rgba: Uint8Array }} image @param {number} x @param {number} y @param {[number, number, number, number]} color */
function paint(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.rgba.set(color, (y * image.width + x) * 4);
}

/** This fixture deliberately does not call the production arc mask helper. */
function drawEllipseArc(image, box, startDeg, endDeg, color, transform = {}) {
  const span = endDeg > startDeg ? endDeg - startDeg : endDeg - startDeg + 360;
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  const radiusX = box.w / 2;
  const radiusY = box.h / 2;
  const rotation = (transform.rotationDeg || 0) * Math.PI / 180;
  for (let index = 0; index <= Math.ceil(span * 4); index += 1) {
    const angle = (startDeg + span * index / Math.ceil(span * 4)) * Math.PI / 180;
    const cosine = Math.cos(angle); const sine = Math.sin(angle);
    const denominator = Math.hypot(radiusY * cosine, radiusX * sine);
    let x = radiusX * radiusY * cosine / denominator;
    let y = radiusX * radiusY * sine / denominator;
    if (transform.flipH) x = -x;
    if (transform.flipV) y = -y;
    const pointX = centerX + x * Math.cos(rotation) - y * Math.sin(rotation);
    const pointY = centerY + x * Math.sin(rotation) + y * Math.cos(rotation);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) paint(image, Math.round(pointX + dx), Math.round(pointY + dy), color);
  }
}

/** @param {object} [overrides] */
function semanticArc(overrides = {}) {
  return {
    id: "semantic-arc",
    type: "arc",
    box: { x: 20, y: 16, w: 100, h: 64 },
    style: { stroke: "#2864C8", strokeWidthPt: 2, adjustments: [270, 360] },
    source: { semanticNativeStructure: true },
    ...overrides
  };
}

const slideSize = Object.freeze({ widthPt: 140, heightPt: 100 });

test("semantic arc admission retains a source-supported elliptical arc and does not mutate inputs", () => {
  const image = imageOf(280, 200);
  const arc = semanticArc();
  drawEllipseArc(image, { x: 40, y: 32, w: 200, h: 128 }, 270, 360, [40, 100, 200, 255]);
  const page = { shapes: [arc, { id: "other", type: "line" }] };
  const original = structuredClone(page);
  const rgba = Buffer.from(image.rgba);
  const result = admitSemanticArcs({ page, slideSize, image });
  assert.notEqual(result.shapes, page.shapes);
  assert.deepEqual(result.shapes, page.shapes);
  assert.deepEqual(page, original);
  assert.deepEqual(image.rgba, rgba);
  assert.deepEqual(result.evidence, { candidates: 1, accepted: 1, rejected: 0 });
});

test("semantic arc admission rejects blank, endpoint-only, offset, and wrong-color candidates", () => {
  const arc = semanticArc();
  const endpointOnly = imageOf(280, 200);
  paint(endpointOnly, 140, 32, [40, 100, 200, 255]);
  paint(endpointOnly, 240, 96, [40, 100, 200, 255]);
  const cases = [
    imageOf(280, 200),
    endpointOnly,
    (() => { const image = imageOf(280, 200); drawEllipseArc(image, { x: 48, y: 32, w: 200, h: 128 }, 270, 360, [40, 100, 200, 255]); return image; })(),
    (() => { const image = imageOf(280, 200); drawEllipseArc(image, { x: 40, y: 32, w: 200, h: 128 }, 270, 360, [216, 40, 40, 255]); return image; })(),
    (() => { const image = imageOf(280, 200); drawEllipseArc(image, { x: 40, y: 32, w: 200, h: 128 }, 270, 360, [40, 100, 200, 0]); return image; })()
  ];
  for (const image of cases) {
    const result = admitSemanticArcs({ page: { shapes: [arc, { id: "keep", type: "rect" }] }, slideSize, image });
    assert.deepEqual(result.shapes.map((shape) => shape.id), ["keep"]);
    assert.deepEqual(result.evidence, { candidates: 1, accepted: 0, rejected: 1 });
  }
});

test("semantic arc admission supports black and white strokes plus rotated, flipped non-circular geometry", () => {
  const arc = semanticArc({ box: { x: 16, y: 18, w: 90, h: 48 }, style: { stroke: "#000000", strokeWidthPt: 1.5, adjustments: [45, 180], flipH: true, rotationDeg: 27 } });
  const image = imageOf(280, 200, [255, 255, 255, 255]);
  drawEllipseArc(image, { x: 32, y: 36, w: 180, h: 96 }, 45, 180, [0, 0, 0, 255], { flipH: true, rotationDeg: 27 });
  assert.equal(admitSemanticArcs({ page: { shapes: [arc] }, slideSize, image }).evidence.accepted, 1);
  const whiteArc = semanticArc({ style: { stroke: "#FFFFFF", strokeWidthPt: 2, adjustments: [270, 360] } });
  const black = imageOf(280, 200, [0, 0, 0, 255]);
  drawEllipseArc(black, { x: 40, y: 32, w: 200, h: 128 }, 270, 360, [255, 255, 255, 255]);
  assert.equal(admitSemanticArcs({ page: { shapes: [whiteArc] }, slideSize, image: black }).evidence.accepted, 1);
});

test("semantic arc admission ignores non-semantic arcs and does not require an image when there are no candidates", () => {
  const page = { shapes: [{ id: "ordinary", type: "arc", source: { semanticNativeStructure: false } }, { id: "rect", type: "rect" }] };
  const result = admitSemanticArcs({ page, slideSize });
  assert.deepEqual(result.shapes, page.shapes);
  assert.notEqual(result.shapes, page.shapes);
  assert.deepEqual(result.evidence, { candidates: 0, accepted: 0, rejected: 0 });
});

test("matching flat background and nearly transparent pixels do not prove an arc", () => {
  for (const [stroke, background] of [["#FFFFFF", [255, 255, 255, 255]], ["#2864C8", [40, 100, 200, 255]]]) {
    const arc = semanticArc({ style: { stroke, strokeWidthPt: 2, adjustments: [270, 360] } });
    assert.equal(admitSemanticArcs({ page: { shapes: [arc] }, slideSize, image: imageOf(280, 200, background) }).evidence.rejected, 1);
  }
  const image = imageOf(280, 200);
  drawEllipseArc(image, { x: 40, y: 32, w: 200, h: 128 }, 270, 360, [40, 100, 200, 1]);
  assert.equal(admitSemanticArcs({ page: { shapes: [semanticArc()] }, slideSize, image }).evidence.rejected, 1);
});

test("semantic arc admission rejects malformed image and request boundaries without echoing input", () => {
  const request = { page: { shapes: [semanticArc()] }, slideSize, image: { width: 10, height: 10, rgba: Buffer.alloc(2) } };
  assert.throws(() => admitSemanticArcs(request), /semantic arc image is invalid/u);
  assert.throws(() => admitSemanticArcs({ page: null, slideSize, image: imageOf(10, 10) }), /semantic arc page is invalid/u);
  assert.throws(() => admitSemanticArcs({ page: { shapes: [] }, slideSize: { widthPt: 0, heightPt: 1 } }), /semantic arc slide size is invalid/u);
  assert.throws(() => admitSemanticArcs({ page: { shapes: [semanticArc()] }, slideSize }), /semantic arc image is invalid/u);
});

test("semantic arc admission rejects malformed candidates and caps adversarial arc volumes", () => {
  const malformed = semanticArc({ style: { stroke: "#2864C8", adjustments: [0, 90, 180] } });
  const result = admitSemanticArcs({ page: { shapes: [malformed] }, slideSize, image: imageOf(280, 200) });
  assert.deepEqual(result.shapes, []);
  assert.deepEqual(result.evidence, { candidates: 1, accepted: 0, rejected: 1 });
  const shapes = Array.from({ length: 129 }, (_, index) => semanticArc({ id: `arc-${index}` }));
  assert.throws(() => admitSemanticArcs({ page: { shapes }, slideSize, image: imageOf(280, 200) }), /semantic arc candidate count exceeds/u);
});
