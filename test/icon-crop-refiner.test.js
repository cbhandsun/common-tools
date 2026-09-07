"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { inferIntrusionEdges, inferPointFacingEdges, mapReferenceBoxToSourcePixels, refineDenseIconCrop, refineStandaloneIconCrop } = require("../skills/pd-hifi-slideclone/scripts/lib/icon-crop-refiner");

function imageWithNeighbor() {
  const width = 20, height = 14;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let pixel = 0; pixel < width * height; pixel += 1) rgba[pixel * 4 + 3] = 255;
  const fill = (x, y, color) => { const offset = (y * width + x) * 4; rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; };
  for (let y = 3; y <= 10; y += 1) for (let x = 3; x <= 10; x += 1) fill(x, y, [20, 180, 100]);
  for (let y = 5; y <= 8; y += 1) for (let x = 16; x <= 19; x += 1) fill(x, y, [20, 180, 100]);
  return { width, height, rgba };
}

test("refines a dominant icon crop by removing connected white background and an adjacent component", () => {
  const result = refineStandaloneIconCrop(imageWithNeighbor(), { paddingPx: 1 });

  assert.equal(result.refined, true);
  assert.equal(result.removedNeighborPixels, 16);
  assert.ok(result.image.width < 14, "expected the unrelated neighbor to be removed from the crop bounds");
  assert.equal(result.image.rgba[3], 0, "expected edge-connected white background to be transparent");
});

test("keeps multi-part icons intact when no foreground component dominates", () => {
  const width = 20, height = 14;
  const image = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  for (let pixel = 0; pixel < width * height; pixel += 1) image.rgba[pixel * 4 + 3] = 255;
  const fill = (x, y) => { const offset = (y * width + x) * 4; image.rgba[offset] = 20; image.rgba[offset + 1] = 180; image.rgba[offset + 2] = 100; };
  for (let y = 3; y <= 6; y += 1) for (let x = 3; x <= 6; x += 1) fill(x, y);
  for (let y = 8; y <= 11; y += 1) for (let x = 13; x <= 16; x += 1) fill(x, y);
  const result = refineStandaloneIconCrop(image);
  assert.equal(result.refined, false);
});

test("retains small disconnected details inside the dominant icon while removing an external neighbor", () => {
  const input = imageWithNeighbor();
  const offset = (6 * input.width + 6) * 4;
  for (let y = 5; y <= 7; y += 1) for (let x = 5; x <= 7; x += 1) input.rgba[(y * input.width + x) * 4 + 3] = 0;
  input.rgba[offset] = 20;
  input.rgba[offset + 1] = 180;
  input.rgba[offset + 2] = 100;
  input.rgba[offset + 3] = 255;

  const result = refineStandaloneIconCrop(input, { paddingPx: 1, detailPaddingPx: 2 });

  assert.equal(result.refined, true);
  assert.equal(result.retainedDetailComponents, 1);
  assert.equal(result.removedNeighborPixels, 16);
  assert.ok([...result.image.rgba].some((value, index) => index % 4 === 3 && value === 255));
});

test("dense icon refinement excludes thin connectors and neutral neighboring cards", () => {
  const width = 44, height = 26; const rgba = Buffer.alloc(width * height * 4, 255);
  const fill = (x, y, [red, green, blue]) => { const offset = (y * width + x) * 4; rgba[offset] = red; rgba[offset + 1] = green; rgba[offset + 2] = blue; };
  for (let y = 5; y <= 18; y += 1) for (let x = 3; x <= 15; x += 1) fill(x, y, [25, 105, 225]);
  for (let x = 16; x <= 32; x += 1) fill(x, 12, [25, 105, 225]);
  for (let x = 27; x <= 42; x += 1) { fill(x, 3, [150, 150, 150]); fill(x, 22, [150, 150, 150]); }
  for (let y = 3; y <= 22; y += 1) { fill(27, y, [150, 150, 150]); fill(42, y, [150, 150, 150]); }
  const result = refineDenseIconCrop({ width, height, rgba }, { minimumNeighbors: 17, paddingPx: 2 });
  assert.equal(result.refined, true);
  assert.ok(result.box.x < 5 && result.box.w < 22, "expected the dense blue icon rather than the card or connector");
  assert.ok(result.removedNeighborPixels > 0);
});

test("dense icon refinement handles empty crops and rejects malformed buffers", () => {
  const empty = { width: 12, height: 12, rgba: Buffer.alloc(12 * 12 * 4, 255) };
  assert.equal(refineDenseIconCrop(empty).refined, false);
  assert.throws(() => refineDenseIconCrop({ width: 2, height: 2, rgba: Buffer.alloc(3) }), /valid RGBA/u);
});

test("dense icon refinement trims a requested top-edge intrusion without flattening the icon body", () => {
  const width = 36, height = 26; const rgba = Buffer.alloc(width * height * 4, 255);
  const blue = (x, y) => { const offset = (y * width + x) * 4; rgba[offset] = 25; rgba[offset + 1] = 105; rgba[offset + 2] = 225; };
  for (let y = 9; y <= 23; y += 1) for (let x = 3; x <= 29; x += 1) blue(x, y);
  for (let y = 1; y <= 8; y += 1) for (let x = 15; x <= 18; x += 1) blue(x, y);
  const result = refineDenseIconCrop({ width, height, rgba }, { minimumNeighbors: 17, paddingPx: 2, intrusionEdges: ["top"] });
  assert.equal(result.refined, true);
  assert.ok(result.trimmedEdgeIntrusionPx.top >= 4);
  assert.ok(result.image.height >= 14, "expected the dense icon body to remain intact");
});

test("dense icon refinement applies the same intrusion rule to every requested edge", () => {
  const create = (edge) => {
    const width = 36, height = 36; const rgba = Buffer.alloc(width * height * 4, 255);
    const blue = (x, y) => { const offset = (y * width + x) * 4; rgba[offset] = 25; rgba[offset + 1] = 105; rgba[offset + 2] = 225; };
    for (let y = 9; y <= 27; y += 1) for (let x = 9; x <= 27; x += 1) blue(x, y);
    for (let step = 1; step <= 8; step += 1) {
      if (edge === "top") for (let x = 16; x <= 19; x += 1) blue(x, 9 - step);
      if (edge === "bottom") for (let x = 16; x <= 19; x += 1) blue(x, 27 + step);
      if (edge === "left") for (let y = 16; y <= 19; y += 1) blue(9 - step, y);
      if (edge === "right") for (let y = 16; y <= 19; y += 1) blue(27 + step, y);
    }
    return { width, height, rgba };
  };
  for (const edge of ["top", "right", "bottom", "left"]) {
    const result = refineDenseIconCrop(create(edge), { minimumNeighbors: 17, paddingPx: 2, intrusionEdges: [edge] });
    assert.ok(result.trimmedEdgeIntrusionPx[edge] >= 4, `expected ${edge} intrusion to be trimmed`);
  }
});

test("dense icon refinement validates requested intrusion edges", () => {
  const image = { width: 12, height: 12, rgba: Buffer.alloc(12 * 12 * 4, 255) };
  assert.throws(() => refineDenseIconCrop(image, { intrusionEdges: "top" }), /array/u);
  assert.throws(() => refineDenseIconCrop(image, { intrusionEdges: ["diagonal"] }), /unsupported intrusion edge/u);
});

test("dense icon refinement removes an arrowhead lobe that overlaps the retained edge", () => {
  const width = 40, height = 34; const rgba = Buffer.alloc(width * height * 4, 255);
  const blue = (x, y) => { const offset = (y * width + x) * 4; rgba[offset] = 25; rgba[offset + 1] = 105; rgba[offset + 2] = 225; };
  for (let y = 10; y <= 30; y += 1) for (let x = 8; x <= 28; x += 1) blue(x, y);
  for (let y = 1; y <= 9; y += 1) for (let x = 17; x <= 20; x += 1) blue(x, y);
  for (let y = 7; y <= 12; y += 1) for (let x = 21; x <= 35 - Math.abs(9 - y) * 2; x += 1) blue(x, y);
  const result = refineDenseIconCrop({ width, height, rgba }, { minimumNeighbors: 17, paddingPx: 2, intrusionEdges: ["top"] });
  assert.ok(result.trimmedEdgeIntrusionPx.top > 0);
  assert.ok(result.removedOverlapPixels > 0, "expected the off-center overlapping lobe to be removed");
  assert.ok(result.image.rgba.some((value, index) => index % 4 === 3 && value >= 32), "expected the centered icon body to remain");
});

test("infers cleanup edges from nearby relationship endpoints before using the group-center fallback", () => {
  const box = { x: 100, y: 100, w: 40, h: 30 };
  assert.deepEqual(inferIntrusionEdges({
    box,
    relationships: [{ type: "line", box: { x: 120, y: 130, w: 0, h: 50 } }],
    fallbackPoint: { x: 40, y: 115 }
  }), ["bottom"]);
  assert.deepEqual(inferIntrusionEdges({ box, relationships: [], fallbackPoint: { x: 40, y: 115 } }), ["left"]);
});

test("relationship edge inference handles horizontal and reversed segments and rejects invalid boundaries", () => {
  const box = { x: 100, y: 100, w: 40, h: 30 };
  assert.deepEqual(inferIntrusionEdges({ box, relationships: [{ box: { x: 70, y: 115, w: 30, h: 0 } }] }), ["left"]);
  assert.deepEqual(inferIntrusionEdges({ box, relationships: [{ box: { x: 170, y: 115, w: -30, h: 0 } }] }), ["right"]);
  assert.deepEqual(inferIntrusionEdges({ box, relationships: [{ box: { x: 0, y: 0, w: 5, h: 5 } }] }), []);
  assert.throws(() => inferIntrusionEdges({ box, relationships: {} }), /array/u);
  assert.throws(() => inferIntrusionEdges({ box, relationships: [], maximumDistance: -1 }), /non-negative/u);
});

test("point-facing inference exposes both plausible edges for diagonal relationships", () => {
  const box = { x: 100, y: 100, w: 40, h: 30 };
  assert.deepEqual(inferPointFacingEdges(box, { x: 170, y: 160 }), ["right", "bottom"]);
  assert.deepEqual(inferPointFacingEdges(box, { x: 120, y: 20 }), ["top"]);
  assert.throws(() => inferPointFacingEdges(box, { x: 170, y: 160 }, 0.5), /at least 1/u);
});

test("maps preview coordinates to full-resolution source pixels without clipping fractional edges", () => {
  assert.deepEqual(
    mapReferenceBoxToSourcePixels(
      { x: 130, y: 318, w: 105, h: 105 },
      { width: 1824, height: 1368 },
      { width: 2304, height: 1728 },
      { paddingPx: 2 }
    ),
    { x: 162, y: 399, w: 137, h: 138 }
  );
});

test("rejects malformed or out-of-bounds preview crop coordinates", () => {
  assert.throws(() => mapReferenceBoxToSourcePixels(
    { x: -1, y: 0, w: 10, h: 10 },
    { width: 100, height: 100 },
    { width: 200, height: 200 }
  ), /referenceBox/u);
  assert.throws(() => mapReferenceBoxToSourcePixels(
    { x: 95, y: 95, w: 10, h: 10 },
    { width: 100, height: 100 },
    { width: 200, height: 200 }
  ), /exceeds/u);
});
