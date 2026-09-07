"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../packages/slideclone-core/png");
const { createFullSlideResidualBuilder } = require("../packages/slideclone-core/full-slide-native-residual");

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "residual-publication-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"), outputFile = path.join(root, "output.png");
  writePng(sourceFile, { width: 4, height: 4, rgba: Buffer.alloc(64, 128) });
  const sourceBytes = fs.readFileSync(sourceFile);
  const build = createFullSlideResidualBuilder({ readPng, writePng, eraseMasks: (image) => image, ...overrides });
  return { root, sourceBytes, build, request: { sourceFile, outputFile, objects: [], slideSize: { x: 0, y: 0, w: 4, h: 4 } } };
}

test("residual publication refuses the source path and aliases before writing", async (t) => {
  const value = fixture(t);
  await assert.rejects(value.build({ ...value.request, outputFile: value.request.sourceFile }), /source/);
  const alias = path.join(value.root, "alias.png");
  fs.linkSync(value.request.sourceFile, alias);
  await assert.rejects(value.build({ ...value.request, outputFile: alias }), /source/);
  assert.deepEqual(fs.readFileSync(value.request.sourceFile), value.sourceBytes);
});

test("failed output writes preserve the previous output and remove temporary files", async (t) => {
  const value = fixture(t, { writePng(file) { fs.writeFileSync(file, "partial"); throw new Error("injected write failure"); } });
  fs.writeFileSync(value.request.outputFile, value.sourceBytes);
  await assert.rejects(value.build(value.request), /injected write failure/);
  assert.deepEqual(fs.readFileSync(value.request.outputFile), value.sourceBytes);
  assert.deepEqual(fs.readdirSync(value.root).sort(), ["output.png", "source.png"]);
});

test("cancellation before publication leaves no output and cleans temporary files", async (t) => {
  const value = fixture(t);
  let polls = 0;
  await assert.rejects(value.build({ ...value.request, isCancellationRequested: async () => ++polls === 2 }), /cancelled/);
  assert.deepEqual(fs.readdirSync(value.root), ["source.png"]);
});

test("successful publication replaces the output with a validated residual", async (t) => {
  const value = fixture(t);
  fs.writeFileSync(value.request.outputFile, "old output");
  const result = await value.build(value.request);
  assert.equal(result.widthPx, 4);
  assert.deepEqual(readPng(value.request.outputFile).rgba, readPng(value.request.sourceFile).rgba);
  assert.deepEqual(fs.readdirSync(value.root).sort(), ["output.png", "source.png"]);
});

test("one native arc reports one erased object while expanding to path masks", async (t) => {
  let maskCount = 0;
  const value = fixture(t, { eraseMasks(image, masks) { maskCount = masks.length; return image; } });
  const result = await value.build({
    ...value.request,
    objects: [{ type: "arc", style: { fill: "none", adjustments: [270, 360] }, box: { x: 0, y: 0, w: 4, h: 4 } }]
  });
  assert.equal(result.erasedObjects, 1);
  assert.equal(result.erasedTextBoxes, 0);
  assert.ok(maskCount > 1);
});

test("arc expansion is bounded before erasure or publication", async (t) => {
  let erased = false;
  const value = fixture(t, { eraseMasks(image) { erased = true; return image; } });
  const arc = { type: "arc", style: { fill: "none", adjustments: [0, 360] }, box: { x: 0, y: 0, w: 4, h: 4 } };
  await assert.rejects(value.build({ ...value.request, objects: Array.from({ length: 334 }, () => arc) }), /mask count exceeds/);
  assert.equal(erased, false);
  assert.equal(fs.existsSync(value.request.outputFile), false);
});

test("invalid paths and malformed staged output fail without changing existing files", async (t) => {
  const value = fixture(t, { writePng(file) { fs.writeFileSync(file, "invalid"); } });
  for (const outputFile of ["relative.png", "", "x".repeat(32769), value.request.outputFile + "\0"]) {
    await assert.rejects(value.build({ ...value.request, outputFile }));
  }
  fs.writeFileSync(value.request.outputFile, value.sourceBytes);
  await assert.rejects(value.build(value.request), /output is invalid/);
  assert.deepEqual(fs.readFileSync(value.request.outputFile), value.sourceBytes);
  assert.deepEqual(fs.readdirSync(value.root).sort(), ["output.png", "source.png"]);
});

test("cancellation-query failure preserves old output and removes staging", async (t) => {
  const value = fixture(t);
  fs.writeFileSync(value.request.outputFile, value.sourceBytes);
  let calls = 0;
  await assert.rejects(value.build({ ...value.request, isCancellationRequested() {
    if (++calls === 2) throw new Error("cancel query failed");
    return false;
  } }), /cancel query failed/);
  assert.deepEqual(fs.readFileSync(value.request.outputFile), value.sourceBytes);
  assert.deepEqual(fs.readdirSync(value.root).sort(), ["output.png", "source.png"]);
});
