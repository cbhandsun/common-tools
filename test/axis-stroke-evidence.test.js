"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { axisStrokeEvidenceMask } = require("../packages/slideclone-core/axis-stroke-evidence");

function raster(width = 50, height = 40) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
}
function fill(image, x, y, width, height, color) {
  for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) {
    image.rgba.set(color, (row * image.width + column) * 4);
  }
}

test("source stroke evidence is axis-specific, color-independent and excludes broad fills", () => {
  for (const color of [[90, 130, 190, 255], [180, 90, 140, 255], [85, 85, 85, 255]]) {
    const image = raster();
    fill(image, 5, 10, 40, 3, color);
    const horizontal = axisStrokeEvidenceMask({ image, axis: "h" });
    const vertical = axisStrokeEvidenceMask({ image, axis: "v" });
    assert.equal(horizontal.reduce((sum, value) => sum + value, 0), 120);
    assert.equal(vertical.some(Boolean), false);
    fill(image, 5, 10, 40, 18, color);
    assert.equal(axisStrokeEvidenceMask({ image, axis: "h" }).some(Boolean), false);
  }
});

test("a flat background, one-sided transition or unsupported edge never proves a stroke", () => {
  assert.equal(axisStrokeEvidenceMask({ image: raster(), axis: "h" }).some(Boolean), false);
  const image = raster();
  fill(image, 0, 0, 50, 4, [110, 160, 130, 255]);
  assert.equal(axisStrokeEvidenceMask({ image, axis: "h" }).some(Boolean), false);
  assert.deepEqual(axisStrokeEvidenceMask({ image: raster(1, 1), axis: "v" }), new Uint8Array(1));
});

test("invalid, excessive, proxy and getter inputs fail without executing caller data", () => {
  for (const input of [null, {}, { image: raster(), axis: "diagonal" }, { image: { width: 0, height: 1, rgba: new Uint8Array(0) }, axis: "h" },
    { image: { width: 20000, height: 1, rgba: new Uint8Array(80000) }, axis: "h" },
    { image: { ...raster(), rgba: new Uint8Array(4) }, axis: "h" }]) {
    assert.equal(axisStrokeEvidenceMask(input), null);
  }
  let invoked = 0;
  const accessor = Object.defineProperty({}, "image", { get() { invoked++; return raster(); } });
  const proxy = new Proxy({}, { get() { invoked++; throw new Error("private input"); } });
  const coercion = { toString() { invoked++; return "h"; } };
  assert.equal(axisStrokeEvidenceMask(accessor), null);
  assert.equal(axisStrokeEvidenceMask(proxy), null);
  assert.equal(axisStrokeEvidenceMask({ image: raster(), axis: coercion }), null);
  const inherited = raster();
  Object.defineProperty(inherited.rgba, "length", { get() { invoked++; throw new Error("must not execute"); } });
  assert.equal(axisStrokeEvidenceMask({ image: inherited, axis: "h" }).some(Boolean), false);
  assert.equal(invoked, 0);
});
