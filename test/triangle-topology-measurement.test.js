"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { measureTriangleTopologyPrimitives } = require("../skills/pd-hifi-slideclone/scripts/lib/triangle-topology-measurement");

test("measures arrow geometry, baseline, and center from accent pixels", () => {
  const image = blankImage(400, 320);
  const color = [42, 116, 201, 255];
  drawArrow(image, { x: 48, y: 245 }, { x: 158, y: 55 }, 10, 28, 24, color);
  drawArrow(image, { x: 242, y: 55 }, { x: 352, y: 245 }, 10, 28, 24, color);
  drawArrow(image, { x: 342, y: 298 }, { x: 58, y: 298 }, 10, 28, 24, color);
  drawSegment(image, { x: 58, y: 266 }, { x: 342, y: 266 }, 8, color);
  drawCircle(image, { x: 200, y: 180 }, 12, color);

  const result = measureTriangleTopologyPrimitives(
    image,
    { x: 0, y: 0, w: 400, h: 320 },
    { widthPt: 400, heightPt: 320 }
  );

  assert.ok(result);
  assert.equal(result.arrows.length, 3);
  assert.ok(result.arrows[0].from.x < result.arrows[0].to.x);
  assert.ok(result.arrows[0].from.y > result.arrows[0].to.y);
  assert.ok(result.arrows[1].from.y < result.arrows[1].to.y);
  assert.ok(result.arrows[2].from.x > result.arrows[2].to.x);
  assert.ok(result.arrows.every((arrow) => arrow.headWidthPt > arrow.shaftWidthPt * 1.5));
  assert.ok(result.baseline.strokeWidthPt >= 6 && result.baseline.strokeWidthPt <= 10);
  assert.ok(result.center.w >= 22 && result.center.w <= 30);
});

test("fails closed for blank, malformed, and excessive image input", () => {
  assert.equal(measureTriangleTopologyPrimitives(blankImage(80, 80), { x: 0, y: 0, w: 80, h: 80 }, { widthPt: 80, heightPt: 80 }), null);
  assert.equal(measureTriangleTopologyPrimitives({ width: 20, height: 20, rgba: [] }, { x: 0, y: 0, w: 80, h: 80 }, { widthPt: 80, heightPt: 80 }), null);
  assert.equal(measureTriangleTopologyPrimitives({ width: 6000, height: 6000, rgba: new Uint8Array(4) }, { x: 0, y: 0, w: 80, h: 80 }, { widthPt: 80, heightPt: 80 }), null);
});

function blankImage(width, height) {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  return { width, height, rgba };
}

function drawArrow(image, from, to, shaftWidth, headWidth, headLength, color) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const base = { x: to.x - ux * headLength, y: to.y - uy * headLength };
  drawSegment(image, from, base, shaftWidth, color);
  fillTriangle(
    image,
    to,
    { x: base.x + px * headWidth / 2, y: base.y + py * headWidth / 2 },
    { x: base.x - px * headWidth / 2, y: base.y - py * headWidth / 2 },
    color
  );
}

function drawSegment(image, from, to, width, color) {
  const minimumX = Math.max(0, Math.floor(Math.min(from.x, to.x) - width));
  const maximumX = Math.min(image.width - 1, Math.ceil(Math.max(from.x, to.x) + width));
  const minimumY = Math.max(0, Math.floor(Math.min(from.y, to.y) - width));
  const maximumY = Math.min(image.height - 1, Math.ceil(Math.max(from.y, to.y) + width));
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if (distanceToSegment({ x, y }, from, to) <= width / 2) setPixel(image, x, y, color);
    }
  }
}

function fillTriangle(image, a, b, c, color) {
  const minimumX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maximumX = Math.min(image.width - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minimumY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maximumY = Math.min(image.height - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if (insideTriangle({ x, y }, a, b, c)) setPixel(image, x, y, color);
    }
  }
}

function drawCircle(image, center, radius, color) {
  for (let y = Math.floor(center.y - radius); y <= Math.ceil(center.y + radius); y += 1) {
    for (let x = Math.floor(center.x - radius); x <= Math.ceil(center.x + radius); x += 1) {
      if (Math.hypot(x - center.x, y - center.y) <= radius) setPixel(image, x, y, color);
    }
  }
}

function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

function insideTriangle(point, a, b, c) {
  const area = (left, right, other) => (left.x - other.x) * (right.y - other.y) - (right.x - other.x) * (left.y - other.y);
  const first = area(point, a, b);
  const second = area(point, b, c);
  const third = area(point, c, a);
  return (first >= 0 && second >= 0 && third >= 0) || (first <= 0 && second <= 0 && third <= 0);
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const index = (y * image.width + x) * 4;
  image.rgba.set(color, index);
}
