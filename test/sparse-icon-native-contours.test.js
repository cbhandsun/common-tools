"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { vectorizeVerifiedLineArtIcon } = require("../packages/slideclone-core/archetypes/sparse-icon-native-contours");

function image(width, height) { return { width, height, rgba: Buffer.alloc(width * height * 4, 255) }; }
function fill(im, x, y, w, h, color) {
  for (let row = y; row < y + h; row += 1) for (let col = x; col < x + w; col += 1) {
    const offset = (row * im.width + col) * 4;
    im.rgba.set([...color, 255], offset);
  }
}

test("verified line art emits connected contour objects with holes and interior fills", () => {
  const im = image(64, 64);
  fill(im, 8, 8, 48, 48, [20, 20, 20]);
  fill(im, 12, 12, 40, 40, [215, 233, 255]);
  const source = { detector: "verified-icon", editable: true };
  const shapes = vectorizeVerifiedLineArtIcon({ image: im, box: { x: 100, y: 200, w: 32, h: 64 }, idPrefix: "outline", source });
  assert.equal(shapes.length, 2);
  assert.equal(shapes[0].source.iconPart, "interior-contour");
  assert.equal(shapes[1].source.iconPart, "outline-contour");
  assert.equal(shapes[1].style.freeformSegments.filter((s) => s.type === "close").length, 2);
  assert.deepEqual(shapes[1].box, { x: 104, y: 208, w: 24, h: 48 });
  assert.ok(shapes.every((s) => s.type === "freeform" && s.source.detector === "verified-icon"));
  assert.deepEqual(source, { detector: "verified-icon", editable: true });
});

test("verified line art rejects empty content and excessive disconnected geometry", () => {
  const im = image(64, 64);
  const request = { image: im, box: { x: 0, y: 0, w: 64, h: 64 }, idPrefix: "outline" };
  assert.deepEqual(vectorizeVerifiedLineArtIcon(request), []);
  for (let y = 0; y < 60; y += 12) for (let x = 0; x < 60; x += 12) fill(im, x, y, 4, 4, [20, 20, 20]);
  assert.deepEqual(vectorizeVerifiedLineArtIcon(request), []);
});

test("verified line art validates image and target boundaries", () => {
  const request = { image: image(64, 64), box: { x: 0, y: 0, w: 64, h: 64 }, idPrefix: "outline" };
  for (const im of [null, { width: 0, height: 1, rgba: Buffer.alloc(0) }, { width: 64, height: 64, rgba: Buffer.alloc(1) },
    { width: 513, height: 1, rgba: Buffer.alloc(513 * 4) }]) {
    assert.throws(() => vectorizeVerifiedLineArtIcon({ ...request, image: im }), TypeError);
  }
  assert.throws(() => vectorizeVerifiedLineArtIcon({ ...request, box: { ...request.box, w: Infinity } }), TypeError);
  assert.throws(() => vectorizeVerifiedLineArtIcon({ ...request, idPrefix: "" }), TypeError);
});

test("verified line art ignores tiny interior fill speckles while retaining valid outlines", () => {
  const im = image(64, 64);
  fill(im, 8, 8, 20, 20, [20, 20, 20]);
  fill(im, 40, 40, 4, 4, [215, 233, 255]);
  const shapes = vectorizeVerifiedLineArtIcon({ image: im, box: { x: 0, y: 0, w: 64, h: 64 }, idPrefix: "outline" });
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].source.iconPart, "outline-contour");
});
