"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { materializeGraphicCrops, refineGraphicCrop } = require("../skills/pd-hifi-slideclone/scripts/lib/graphic-crop-materializer");
const { readPng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

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
