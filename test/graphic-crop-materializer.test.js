"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { materializeGraphicCrops, refineGraphicCrop } = require("../packages/slideclone-core/scene-plan/graphic-crop-materializer");
const { readPng } = require("../packages/slideclone-core/png");
const { splitSparseLargeGraphicComponents } = require("../packages/slideclone-core/scene-plan/residual-component-analysis");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-crop-module-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const image = { width: 60, height: 40, rgba: Buffer.alloc(60 * 40 * 4, 255) };
  for (let y = 12; y < 22; y += 1) for (let x = 14; x < 28; x += 1) {
    const offset = (y * image.width + x) * 4;
    image.rgba[offset] = 20; image.rgba[offset + 1] = 40; image.rgba[offset + 2] = 60;
  }
  const component = { box: { x: 10, y: 8, w: 24, h: 20 } };
  const options = { assetDir: path.join(root, "assets"), irDir: root, deckName: "fixture", pageIndex: 0 };
  const operations = {
    shouldFullyObjectifyEntropyChallenge: () => false,
    ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true }),
    ptToPxBox: (box) => ({ ...box }),
    foregroundComponents: () => [component],
    mergeCloseComponent: (value) => value,
    isUsefulGraphicComponent: () => true,
    mergeGraphicComponents: (items) => items,
    aggregateForegroundComponent: () => null,
    shouldAddAggregateComponent: () => false,
    pxToPtBox: (box) => ({ ...box }),
    classifyGraphicCropExpression: () => null
  };
  const run = () => materializeGraphicCrops(image, [], { widthPt: 960, heightPt: 540 }, options, operations);
  return { root, image, component, options, operations, run };
}

test("graphic crop stage writes refined pixels with source-coordinate evidence and preserves its input", (t) => {
  const f = fixture(t);
  const original = Buffer.from(f.image.rgba);
  const [artifact] = f.run();
  const refined = refineGraphicCrop(f.image, f.component.box);
  const output = readPng(path.join(f.root, artifact.assetPath));
  assert.deepEqual(output.rgba, refined.image.rgba);
  assert.equal(output.width, artifact.box.w);
  assert.equal(output.height, artifact.box.h);
  assert.equal(artifact.source.protectedMinimumUnit, true);
  assert.equal(artifact.source.editable, false);
  assert.equal(artifact.source.cropEvidenceRequired, true);
  assert.deepEqual(artifact.source.originalPixelBox, f.component.box);
  assert.deepEqual(artifact.source.tightenedPixelBox, artifact.box);
  assert.deepEqual(f.image.rgba, original);
  assert.equal(artifact.assetPath, "assets/fixture-p01-g01.png");
});

test("graphic crop stage preserves aggregate geometry without claiming minimum-unit evidence", (t) => {
  const f = fixture(t);
  f.component.aggregate = true;
  const [artifact] = f.run();
  assert.deepEqual(artifact.box, f.component.box);
  assert.equal(artifact.source.detector, "foreground-aggregate-crop");
  assert.equal(artifact.source.protectedMinimumUnit, undefined);
  assert.equal(artifact.source.cropEvidenceRequired, undefined);
});

test("graphic crop stage does not claim isolated-icon protection for a crop containing text", (t) => {
  const f = fixture(t);
  const textBoxes = [{ text: "native body", box: { x: 16, y: 14, w: 8, h: 6 } }];
  const [artifact] = materializeGraphicCrops(f.image, textBoxes, { widthPt: 960, heightPt: 540 }, f.options, f.operations);
  assert.equal(artifact.source.protectedMinimumUnit, undefined);
  assert.equal(artifact.source.cropEvidenceRequired, undefined);
  assert.deepEqual(artifact.box, f.component.box);
});

test("graphic crop stage does not label an untightened multi-glyph strip as an icon", (t) => {
  const f = fixture(t);
  f.image.rgba.fill(255);
  for (const x of [12, 18, 24, 30]) {
    for (let y = 12; y < 22; y += 1) for (let column = x; column < x + 2; column += 1) {
      const offset = (y * f.image.width + column) * 4;
      f.image.rgba[offset] = 25; f.image.rgba[offset + 1] = 25; f.image.rgba[offset + 2] = 25;
    }
  }
  const [artifact] = f.run();
  assert.equal(artifact.source.protectedMinimumUnit, undefined);
  assert.equal(artifact.source.tightCropAdmission, undefined);
  assert.deepEqual(artifact.box, f.component.box);
});

test("graphic crop stage keeps explicit classification and a bounded twelve-artifact result", (t) => {
  const f = fixture(t);
  f.operations.foregroundComponents = () => Array.from({ length: 30 }, () => ({ ...f.component }));
  f.operations.classifyGraphicCropExpression = () => ({ detector: "screenshot-panel", reason: "preserve-panel" });
  const artifacts = f.run();
  assert.equal(artifacts.length, 12);
  assert.equal(fs.readdirSync(f.options.assetDir).length, 12);
  assert.ok(artifacts.every((artifact) => artifact.source.detector === "screenshot-panel" && artifact.source.reason === "preserve-panel"));
  assert.ok(artifacts.every((artifact) => artifact.source.protectedMinimumUnit === undefined));
});

test("graphic crop stage handles empty and disabled work without emitting artifacts", (t) => {
  const f = fixture(t);
  f.operations.foregroundComponents = () => [];
  assert.deepEqual(f.run(), []);
  assert.deepEqual(fs.readdirSync(f.options.assetDir), []);
  f.operations.shouldFullyObjectifyEntropyChallenge = () => true;
  f.operations.ensureDir = () => { throw new Error("must not access storage"); };
  assert.deepEqual(f.run(), []);
  f.options.assetDir = undefined;
  assert.deepEqual(f.run(), []);
});

test("graphic crop stage propagates detector and storage failures without inventing success", (t) => {
  const f = fixture(t);
  f.operations.foregroundComponents = () => { throw new Error("detector unavailable"); };
  assert.throws(f.run, /detector unavailable/);
  const sentinel = new Error("storage unavailable");
  f.operations.ensureDir = () => { throw sentinel; };
  assert.throws(f.run, (error) => error === sentinel);
});

test("graphic crop refinement rejects malformed image data", () => {
  assert.throws(() => refineGraphicCrop({ width: 1, height: 1, rgba: null }, { x: 0, y: 0, w: 1, h: 1 }));
});

test("sparse large line-container components split into bounded residual crops", () => {
  const image = whiteImage(640, 420);
  drawRectOutline(image, 60, 60, 220, 70);
  drawRectOutline(image, 330, 60, 230, 70);
  drawRectOutline(image, 70, 220, 500, 80);
  drawLine(image, 170, 130, 170, 220);
  drawLine(image, 445, 130, 445, 220);
  const component = { box: { x: 50, y: 50, w: 540, h: 270 }, sampledCount: 420 };

  const parts = splitSparseLargeGraphicComponents([component], image);

  assert.ok(parts.length >= 2, "expected sparse structure to be split");
  assert.ok(parts.every((part) => part.box.w * part.box.h < component.box.w * component.box.h * 0.45));
  const totalArea = parts.reduce((sum, part) => sum + part.box.w * part.box.h, 0);
  assert.ok(totalArea < component.box.w * component.box.h * 0.82);
});

test("sparse large splitting preserves dense pictorial components", () => {
  const image = whiteImage(640, 420);
  for (let y = 70; y < 310; y += 1) {
    for (let x = 80; x < 560; x += 1) {
      if ((x + y) % 5 !== 0) setPixel(image, x, y, 40, 80, 120, 255);
    }
  }
  const component = { box: { x: 80, y: 70, w: 480, h: 240 }, sampledCount: 30000 };

  const parts = splitSparseLargeGraphicComponents([component], image);

  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].box, component.box);
});

function whiteImage(width, height) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
}

function drawRectOutline(image, x, y, w, h) {
  drawLine(image, x, y, x + w, y);
  drawLine(image, x, y + h, x + w, y + h);
  drawLine(image, x, y, x, y + h);
  drawLine(image, x + w, y, x + w, y + h);
}

function drawLine(image, x1, y1, x2, y2) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(x1 + (x2 - x1) * index / Math.max(1, steps));
    const y = Math.round(y1 + (y2 - y1) * index / Math.max(1, steps));
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        setPixel(image, x + dx, y + dy, 70, 90, 110, 255);
      }
    }
  }
}

function setPixel(image, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = r;
  image.rgba[offset + 1] = g;
  image.rgba[offset + 2] = b;
  image.rgba[offset + 3] = a;
}
