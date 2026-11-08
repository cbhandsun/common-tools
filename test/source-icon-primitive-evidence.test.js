"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { sourceIconPrimitiveEvidence } = require("../packages/slideclone-core/scene-plan/source-icon-primitive-evidence");

const BLUE = [19, 92, 230, 255];
const BLUE_HEX = "#135CE6";
const BACKGROUND = [248, 250, 252, 255];

function raster(width = 72, height = 64, background = BACKGROUND) {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(background, offset);
  return { width, height, rgba };
}

function paintRect(image, box, color = BLUE) {
  for (let row = box.y; row < box.y + box.h; row += 1) {
    for (let column = box.x; column < box.x + box.w; column += 1) {
      image.rgba.set(color, (row * image.width + column) * 4);
    }
  }
}

function paintEllipse(image, box, color = BLUE) {
  for (let row = 0; row < box.h; row += 1) {
    for (let column = 0; column < box.w; column += 1) {
      const nx = (column + 0.5 - box.w / 2) / (box.w / 2);
      const ny = (row + 0.5 - box.h / 2) / (box.h / 2);
      if (nx * nx + ny * ny <= 1) {
        image.rgba.set(color, ((box.y + row) * image.width + box.x + column) * 4);
      }
    }
  }
}

function request(image, pixelBox, fill = BLUE_HEX) {
  return { image, pixelBox, fill };
}

test("solid source rectangles are admitted only with their measured source bounds", () => {
  const image = raster();
  const pixelBox = { x: 18, y: 20, w: 20, h: 16 };
  paintRect(image, pixelBox);

  assert.deepEqual(sourceIconPrimitiveEvidence(request(image, pixelBox)), {
    type: "rect",
    outlineAgreement: 1,
    pixelBox
  });
});

test("source ellipses retain their primitive type and complete outline", () => {
  const image = raster(80, 72);
  const pixelBox = { x: 22, y: 18, w: 24, h: 20 };
  paintEllipse(image, pixelBox);

  const result = sourceIconPrimitiveEvidence(request(image, pixelBox));
  assert.ok(result);
  assert.equal(result.type, "ellipse");
  assert.equal(result.outlineAgreement, 1);
  assert.deepEqual(result.pixelBox, pixelBox);
});

test("a partial seed expands to the complete isolated primitive without mutating the seed", () => {
  const image = raster(80, 72);
  const sourceBox = { x: 20, y: 22, w: 18, h: 14 };
  const seedBox = { x: 25, y: 26, w: 10, h: 8 };
  const originalSeed = { ...seedBox };
  paintRect(image, sourceBox);

  const result = sourceIconPrimitiveEvidence(request(image, seedBox));
  assert.ok(result);
  assert.equal(result.type, "rect");
  assert.deepEqual(result.pixelBox, sourceBox);
  assert.deepEqual(seedBox, originalSeed);
});

test("dense pictorial silhouettes are not promoted from color bounds to primitives", () => {
  const image = raster(80, 72);
  const pixelBox = { x: 20, y: 20, w: 24, h: 20 };
  paintRect(image, pixelBox);
  paintRect(image, { x: 34, y: 20, w: 10, h: 10 }, BACKGROUND);

  assert.equal(sourceIconPrimitiveEvidence(request(image, pixelBox)), null);
});

test("components clipped by the bounded search window are rejected", () => {
  const image = raster();
  paintRect(image, { x: 2, y: 18, w: 18, h: 16 });

  assert.equal(sourceIconPrimitiveEvidence(request(image, { x: 8, y: 22, w: 8, h: 8 })), null);
});

test("empty, malformed and extreme inputs fail closed", () => {
  const image = raster();
  const pixelBox = { x: 18, y: 20, w: 20, h: 16 };
  paintRect(image, pixelBox);
  const invalid = [
    undefined,
    null,
    false,
    0,
    "",
    [],
    {},
    { image, pixelBox, fill: "blue" },
    { image, pixelBox: { ...pixelBox, x: 1 }, fill: BLUE_HEX },
    { image, pixelBox: { ...pixelBox, w: 0 }, fill: BLUE_HEX },
    { image: { width: image.width, height: image.height, rgba: new Uint8Array(0) }, pixelBox, fill: BLUE_HEX },
    { image: { width: 16385, height: 1, rgba: new Uint8Array(0) }, pixelBox, fill: BLUE_HEX },
    { image: { width: 10000, height: 5000, rgba: new Uint8Array(0) }, pixelBox, fill: BLUE_HEX },
    { image: { width: 1024, height: 1024, rgba: new Uint8Array(0) }, pixelBox: { x: 4, y: 4, w: 513, h: 8 }, fill: BLUE_HEX },
    Object.assign(Object.create({ inherited: true }), request(image, pixelBox))
  ];

  for (const value of invalid) {
    assert.doesNotThrow(() => sourceIconPrimitiveEvidence(value));
    assert.equal(sourceIconPrimitiveEvidence(value), null);
  }
});

test("proxies and accessors are rejected without executing caller code", () => {
  const image = raster();
  const pixelBox = { x: 18, y: 20, w: 20, h: 16 };
  paintRect(image, pixelBox);
  let invoked = 0;
  const trap = () => {
    invoked += 1;
    throw new Error("caller code must not execute");
  };
  const rootAccessor = {};
  Object.defineProperty(rootAccessor, "image", { enumerable: true, get: trap });
  const rootProxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  const imageProxy = new Proxy(image, { get: trap, getPrototypeOf: trap, ownKeys: trap });
  const rgbaProxy = new Proxy(image.rgba, { get: trap, getPrototypeOf: trap, ownKeys: trap });

  for (const value of [
    rootAccessor,
    rootProxy,
    request(imageProxy, pixelBox),
    request({ ...image, rgba: rgbaProxy }, pixelBox)
  ]) {
    assert.doesNotThrow(() => sourceIconPrimitiveEvidence(value));
    assert.equal(sourceIconPrimitiveEvidence(value), null);
  }
  assert.equal(invoked, 0);

  const guardedImage = raster();
  paintRect(guardedImage, pixelBox);
  Object.defineProperty(guardedImage.rgba, "length", { configurable: true, get: trap });
  Object.defineProperty(guardedImage.rgba, "buffer", { configurable: true, get: trap });
  assert.equal(sourceIconPrimitiveEvidence(request(guardedImage, pixelBox))?.type, "rect");
  assert.equal(invoked, 0);
});

test("transparent, shared and detached pixel storage cannot authorize a primitive", () => {
  const pixelBox = { x: 18, y: 20, w: 20, h: 16 };

  const transparentShape = raster();
  paintRect(transparentShape, pixelBox, [BLUE[0], BLUE[1], BLUE[2], 239]);
  assert.equal(sourceIconPrimitiveEvidence(request(transparentShape, pixelBox)), null);

  const transparentBackground = raster(72, 64, [248, 250, 252, 0]);
  paintRect(transparentBackground, pixelBox);
  assert.equal(sourceIconPrimitiveEvidence(request(transparentBackground, pixelBox)), null);

  const shared = new Uint8Array(new SharedArrayBuffer(72 * 64 * 4));
  assert.equal(sourceIconPrimitiveEvidence(request({ width: 72, height: 64, rgba: shared }, pixelBox)), null);

  const detachedImage = raster();
  paintRect(detachedImage, pixelBox);
  const detachedBuffer = detachedImage.rgba.buffer;
  structuredClone(detachedBuffer, { transfer: [detachedBuffer] });
  assert.equal(detachedBuffer.byteLength, 0);
  assert.doesNotThrow(() => sourceIconPrimitiveEvidence(request(detachedImage, pixelBox)));
  assert.equal(sourceIconPrimitiveEvidence(request(detachedImage, pixelBox)), null);
});
