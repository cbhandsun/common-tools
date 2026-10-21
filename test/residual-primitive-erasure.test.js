"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("../packages/slideclone-core/png");
const { eraseObjectifiedLayerPrimitives } = require("../packages/slideclone-core/residual-primitive-erasure");
const { filterTextBoxesForGraphicUnderlays } = require("../packages/slideclone-core/page-text-rules");

function makeImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const parsed = parseHex(color);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    rgba[offset] = parsed.r;
    rgba[offset + 1] = parsed.g;
    rgba[offset + 2] = parsed.b;
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  const parsed = parseHex(color);
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      const offset = (row * image.width + column) * 4;
      image.rgba[offset] = parsed.r;
      image.rgba[offset + 1] = parsed.g;
      image.rgba[offset + 2] = parsed.b;
      image.rgba[offset + 3] = 255;
    }
  }
}

function parseHex(hex) {
  const value = String(hex || "").replace(/^#/u, "");
  return { r: Number.parseInt(value.slice(0, 2), 16), g: Number.parseInt(value.slice(2, 4), 16), b: Number.parseInt(value.slice(4, 6), 16) };
}

function pixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return { r: image.rgba[offset], g: image.rgba[offset + 1], b: image.rgba[offset + 2] };
}

function distance(left, right) {
  return Math.abs(left.r - right.r) + Math.abs(left.g - right.g) + Math.abs(left.b - right.b);
}

test("relationship native shells are erased from residual crop assets", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-erase-relationship-primitives-"));
  try {
    const sourceImage = makeImage(420, 220, "#FFFFFF");
    fillRect(sourceImage, 82, 72, 88, 34, "#DBEAFE");
    fillRect(sourceImage, 160, 109, 120, 6, "#2563EB");
    const assetPath = path.join(tempDir, "relationship.png");
    writePng(assetPath, cropPng(sourceImage, { x: 50, y: 50, w: 320, h: 140 }));
    const image = {
      id: "relationship-layer",
      assetPath,
      box: { x: 50, y: 50, w: 320, h: 140 },
      source: {
        visualAtomObjectified: true,
        layer: { layerType: "diagram-zone", recommendedAction: "split-native-with-residual-crop" }
      }
    };

    eraseObjectifiedLayerPrimitives({
      page: { images: [image] },
      sourceImage,
      textBoxes: [],
      primitiveShapes: [
        { type: "roundRect", box: { x: 82, y: 72, w: 88, h: 34 }, source: { detector: "visual-relationship-native-fishbone-node", layerSourceId: "relationship-layer" } },
        { type: "line", box: { x: 160, y: 112, w: 120, h: 0 }, source: { detector: "visual-relationship-native-fishbone-spine", layerSourceId: "relationship-layer" } }
      ],
      slideSize: { widthPt: 420, heightPt: 220 },
      irDir: tempDir
    });

    const erased = readPng(assetPath);
    assert.ok(distance(pixel(erased, 82 - 50 + 20, 72 - 50 + 16), parseHex("#DBEAFE")) > 20);
    assert.ok(distance(pixel(erased, 160 - 50 + 60, 112 - 50), parseHex("#2563EB")) > 40);
    assert.equal(image.source.primitiveErased, true);
    assert.equal(image.source.erasedPrimitiveCount, 2);
    assert.equal(Object.hasOwn(image.source, "textErasedFromCrop"), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("generic foreground residual crops erase covered native text and basic shapes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-erase-generic-foreground-"));
  try {
    const sourceImage = makeImage(420, 220, "#FFFFFF");
    fillRect(sourceImage, 80, 78, 70, 26, "#111827");
    fillRect(sourceImage, 170, 90, 110, 44, "#93C5FD");
    const assetPath = path.join(tempDir, "foreground.png");
    writePng(assetPath, cropPng(sourceImage, { x: 50, y: 50, w: 280, h: 120 }));
    const image = {
      id: "foreground-crop",
      assetPath,
      box: { x: 50, y: 50, w: 280, h: 120 },
      source: { detector: "foreground-graphic-crop" }
    };

    const nativeTexts = [{ text: "Native", box: { x: 80, y: 78, w: 70, h: 26 }, source: { editable: true } }];
    eraseObjectifiedLayerPrimitives({
      page: { images: [image] },
      sourceImage,
      textBoxes: nativeTexts,
      primitiveShapes: [
        { type: "roundRect", box: { x: 170, y: 90, w: 110, h: 44 }, source: { detector: "line-text-native-bordered-card", editable: true } }
      ],
      slideSize: { widthPt: 420, heightPt: 220 },
      irDir: tempDir
    });

    const erased = readPng(assetPath);
    assert.ok(distance(pixel(erased, 80 - 50 + 20, 78 - 50 + 10), parseHex("#111827")) > 40);
    assert.ok(distance(pixel(erased, 170 - 50 + 40, 90 - 50 + 20), parseHex("#93C5FD")) > 40);
    assert.equal(image.source.primitiveErased, true);
    assert.equal(image.source.erasedPrimitiveCount, 1);
    assert.equal(image.source.erasedMaskCount, 2);
    assert.deepEqual(filterTextBoxesForGraphicUnderlays(nativeTexts, [image]), nativeTexts,
      "native text must survive after its raster counterpart was erased");
    assert.equal(image.source.textErasedFromCrop, true);
    assert.equal(Object.hasOwn(image.source, "dropErasedResidualAfterNativeRebuild"), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("objectified paint leaves a transparent residual hole so the native body remains visible", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-native-paint-hole-"));
  try {
    const sourceImage = makeImage(420, 220, "#FFFFFF");
    fillRect(sourceImage, 90, 75, 100, 50, "#304E71");
    fillRect(sourceImage, 245, 80, 12, 12, "#F59E0B");
    const original = Buffer.from(sourceImage.rgba);
    const assetPath = path.join(tempDir, "residual.png");
    writePng(assetPath, cropPng(sourceImage, { x: 50, y: 50, w: 280, h: 120 }));
    const image = {
      id: "paint-with-remaining-detail", assetPath,
      box: { x: 50, y: 50, w: 280, h: 120 },
      source: { visualAtomObjectified: true, layer: { layerType: "diagram-zone" } }
    };
    eraseObjectifiedLayerPrimitives({
      page: { images: [image] }, sourceImage, textBoxes: [],
      primitiveShapes: [{ type: "rect", box: { x: 90, y: 75, w: 100, h: 50 },
        style: { fill: "#304E71", stroke: "none" },
        source: { editable: true, detector: "visual-atom-native-rect", layerSourceId: image.id } }],
      slideSize: { widthPt: 420, heightPt: 220 }, irDir: tempDir
    });
    const erased = readPng(assetPath);
    const body = ((95 - 50) * erased.width + 125 - 50) * 4;
    assert.equal(erased.rgba[body + 3], 0, "a white backplate would cover the blue editable body");
    const detail = ((85 - 50) * erased.width + 250 - 50) * 4;
    assert.deepEqual([...erased.rgba.subarray(detail, detail + 4)], [245, 158, 11, 255]);
    const outside = ((55 - 50) * erased.width + 55 - 50) * 4;
    assert.deepEqual([...erased.rgba.subarray(outside, outside + 4)], [255, 255, 255, 255]);
    assert.deepEqual(sourceImage.rgba, original);
    assert.equal(image.source.erasedPrimitiveCount, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
