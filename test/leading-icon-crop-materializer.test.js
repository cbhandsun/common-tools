"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { materializeLeadingIconCrops } = require("../packages/slideclone-core/archetypes/leading-icon-crop-materializer");
const { refineGraphicCrop } = require("../packages/slideclone-core/scene-plan/graphic-crop-materializer");
const { readPng } = require("../packages/slideclone-core/png");
const { detectLeadingIconCropCandidates } = require("../packages/slideclone-core/archetypes/leading-icon-crop-evidence");
const { auditSemanticEditability } = require("../packages/slideclone-core/quality/semantic-editability-quality");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "leading-icon-materializer-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const image = { width: 320, height: 200, rgba: Buffer.alloc(320 * 200 * 4, 255) };
  for (let y = 89; y < 111; y++) for (let x = 130; x < 150; x++) {
    if (!((x >= 135 && x < 145) || (y >= 94 && y < 104))) continue;
    const offset = (y * image.width + x) * 4;
    image.rgba[offset] = 15; image.rgba[offset + 1] = 130; image.rgba[offset + 2] = 170;
  }
  const textBoxes = [{ id: "native-label", text: "Arbitrary label", box: { x: 160, y: 95, w: 90, h: 10 } }];
  const slideSize = { widthPt: 320, heightPt: 200 };
  const options = { assetDir: path.join(root, "assets"), irDir: root, pageIndex: 0, existingShapes: [] };
  const operations = { refineGraphicCrop };
  const run = () => materializeLeadingIconCrops(image, textBoxes, slideSize, options, operations);
  return { root, image, textBoxes, slideSize, options, operations, run };
}

test("isolated pictorial source icons produce tight transparent crops with auditable provenance", t => {
  const f = fixture(t), before = Buffer.from(f.image.rgba);
  const candidates = detectLeadingIconCropCandidates({ image: f.image, textBoxes: f.textBoxes, slideSize: f.slideSize });
  assert.equal(candidates.length, 1);
  const [icon] = f.run();
  assert.ok(icon);
  assert.equal(icon.source.editable, false);
  assert.equal(icon.source.protectedMinimumUnit, true);
  assert.equal(icon.source.cropEvidenceRequired, true);
  assert.equal(icon.source.sourceIconEvidence.independentSourceROI, true);
  assert.equal(icon.source.tightCropAdmission.operation, "source-isolated-tight-graphic");
  assert.deepEqual(icon.source.tightenedPixelBox, icon.box);
  const saved = readPng(path.join(f.root, icon.assetPath));
  assert.equal(saved.width, icon.box.w);
  assert.equal(saved.height, icon.box.h);
  assert.equal(saved.rgba[3], 0);
  assert.deepEqual(f.image.rgba, before);
  assert.equal(auditSemanticEditability({ slideSize: f.slideSize,
    pages: [{ images: [icon], textBoxes: f.textBoxes, shapes: [] }] }).passed, true);
});

test("empty, overlapped and absent output requests cannot emit a protected crop", t => {
  const f = fixture(t);
  assert.deepEqual(materializeLeadingIconCrops(f.image, [], f.slideSize, f.options, f.operations), []);
  assert.deepEqual(materializeLeadingIconCrops(f.image, f.textBoxes, f.slideSize, {}, f.operations), []);
  const overlapped = f.textBoxes.concat({ text: "Body", box: { x: 134, y: 95, w: 8, h: 10 } });
  assert.deepEqual(materializeLeadingIconCrops(f.image, overlapped, f.slideSize, f.options, f.operations), []);
  assert.equal(fs.existsSync(f.options.assetDir), false);
});

test("invalid crop output context is rejected without echoing private input or writing files", t => {
  const f = fixture(t);
  for (const options of [null, { ...f.options, assetDir: "private\0" }, { ...f.options, assetDir: f.root, irDir: f.options.assetDir },
    { ...f.options, pageIndex: -1 }, { ...f.options, pageIndex: Infinity }]) {
    assert.throws(() => materializeLeadingIconCrops(f.image, f.textBoxes, f.slideSize, options, f.operations), error =>
      error instanceof TypeError && !error.message.includes("private"));
  }
  assert.equal(fs.existsSync(f.options.assetDir), false);
});

test("failed or malformed refinement operations fail before emitting assets", t => {
  const f = fixture(t);
  for (const operations of [{}, { refineGraphicCrop: () => null }, { refineGraphicCrop: () => { throw new Error("refinement failed"); } }]) {
    assert.throws(() => materializeLeadingIconCrops(f.image, f.textBoxes, f.slideSize, f.options, operations));
  }
  assert.equal(fs.existsSync(f.options.assetDir), false);
});

test("unadmitted refinements do not manufacture source isolation evidence", t => {
  const f = fixture(t);
  const [candidate] = detectLeadingIconCropCandidates({ image: f.image, textBoxes: f.textBoxes, slideSize: f.slideSize });
  const refusal = { ...refineGraphicCrop(f.image, candidate.pixelBox), refined: false };
  assert.deepEqual(materializeLeadingIconCrops(f.image, f.textBoxes, f.slideSize, f.options, { refineGraphicCrop: () => refusal }), []);
  assert.equal(fs.existsSync(f.options.assetDir), false);
});

test("accessors and proxies in output options or refinement never execute caller code", t => {
  const f = fixture(t);
  let calls = 0;
  const trap = () => { calls++; throw new Error("private"); };
  const options = Object.defineProperty({ ...f.options }, "pageIndex", { get: trap });
  assert.throws(() => materializeLeadingIconCrops(f.image, f.textBoxes, f.slideSize, options, f.operations), TypeError);
  const proxy = new Proxy({}, { get: trap, ownKeys: trap, getPrototypeOf: trap });
  assert.throws(() => materializeLeadingIconCrops(f.image, f.textBoxes, f.slideSize, f.options, { refineGraphicCrop: () => proxy }), TypeError);
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(f.options.assetDir), false);
});

test("crop write failures remain failures and never return a successful icon", t => {
  const f = fixture(t);
  fs.mkdirSync(f.options.assetDir);
  fs.mkdirSync(path.join(f.options.assetDir, "native-leading-icon-p1-i1.png"));
  assert.throws(f.run, /output file is invalid/);
});

test("linked output directories are rejected before creating anything in their target", t => {
  const f = fixture(t), target = path.join(f.root, "unrelated");
  fs.mkdirSync(target);
  fs.symlinkSync(target, f.options.assetDir, process.platform === "win32" ? "junction" : "dir");
  assert.throws(f.run, /output directory is invalid/);
  assert.deepEqual(fs.readdirSync(target), []);
});
