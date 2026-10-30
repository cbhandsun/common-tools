"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createTemporaryTestDirectory, removeTemporaryTestDirectory } = require('./helpers/temporary-directory.cjs');
const { readPng, writePng } = require("../packages/slideclone-core/png");
const { createFullSlideResidualBuilder } = require("../packages/slideclone-core/archetypes/full-slide-native-residual");
const { sameFileIdentity } = require("../packages/slideclone-core/scene-plan/residual-publication");
const { eraseMasks } = require("../packages/slideclone-core/scene-plan/residual-primitive-erasure");

function fixture(t, overrides = {}) {
  const root = createTemporaryTestDirectory('residual-publication-');
  t.after(() => removeTemporaryTestDirectory(root));
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
test("unresolved source text never replaces an existing published residual", async (t) => {
  let written=0;
  const value=fixture(t,{eraseMasks,writePng(){written++;}});
  const source={width:100,height:60,rgba:Buffer.alloc(100*60*4,255)};
  for(let x=0;x<100;x++)for(let y=25;y<29;y++)source.rgba.set([20,20,20,255],(y*100+x)*4);
  writePng(value.request.sourceFile,source);fs.writeFileSync(value.request.outputFile,"accepted baseline");
  const text={text:"Editable",box:{x:30,y:20,w:40,h:15},font:{color:"#141414"},source:{evidenceBox:{x:30,y:20,w:40,h:15}}};
  await assert.rejects(value.build({...value.request,objects:[text],slideSize:{x:0,y:0,w:100,h:60}}),/retains owned foreground/);
  assert.equal(written,0);assert.equal(fs.readFileSync(value.request.outputFile,"utf8"),"accepted baseline");
});
test("declared OCR with no source glyph evidence cannot be published",async t=>{
  const value=fixture(t,{eraseMasks});
  writePng(value.request.sourceFile,{width:100,height:60,rgba:Buffer.alloc(100*60*4,255)});
  const text={text:"Declared only",font:{color:"#111111"},box:{x:10,y:10,w:60,h:20}};
  await assert.rejects(value.build({...value.request,objects:[text],slideSize:{x:0,y:0,w:100,h:60}}),error=>{
    const evidence=require('../packages/slideclone-core/scene-plan/residual-branch-result').readResidualOwnershipRejection(error);
    assert.equal(evidence?.passed,false);assert.equal(evidence?.unresolvedTextMasks,1);
    assert.ok(Object.isFrozen(evidence));return /retains owned foreground/.test(error.message);
  });
  assert.equal(fs.existsSync(value.request.outputFile),false);
});

test("distinct output files are never refused because their contents match the source", async (t) => {
  const value = fixture(t);
  fs.writeFileSync(value.request.outputFile, value.sourceBytes);
  const result = await value.build(value.request);
  assert.equal(result.widthPx, 4);
  assert.deepEqual(readPng(value.request.outputFile).rgba, readPng(value.request.sourceFile).rgba);
  assert.deepEqual(fs.readdirSync(value.root).sort(), ["output.png", "source.png"]);
});

test("residual publication treats zero and truncated file identities as distinct", () => {
  assert.equal(sameFileIdentity({ dev: 0n, ino: 0n }, { dev: 0n, ino: 0n }), false);
  assert.equal(sameFileIdentity({ dev: 5n, ino: 0n }, { dev: 5n, ino: 42n }), false);
  assert.equal(sameFileIdentity({ dev: 5n, ino: 42n }, { dev: 5n, ino: 42n }), true);
  assert.equal(sameFileIdentity({ dev: 5n, ino: 42n }, { dev: 5n, ino: 43n }), false);
  assert.equal(sameFileIdentity({ dev: 5n, ino: 42n }, { dev: 6n, ino: 42n }), false);
  assert.throws(() => sameFileIdentity({ dev: 5, ino: 42 }, { dev: 5n, ino: 42n }), /file identity is invalid/u);
});

test("one native arc reports one erased object while expanding to path masks", async (t) => {
  let maskCount = 0;
  const value = fixture(t, { eraseMasks(image, masks, options) { maskCount = masks.length; return eraseMasks(image, masks, options); } });
  const result = await value.build({
    ...value.request,
    objects: [{ type: "arc", style: { fill: "none", adjustments: [270, 360] }, box: { x: 0, y: 0, w: 4, h: 4 } }]
  });
  assert.equal(result.erasedObjects, 1);
  assert.equal(result.erasedTextBoxes, 0);
  assert.ok(maskCount > 1);
  assert.equal(result.pixelOwnership.passed, true);
  assert.equal(result.pixelOwnership.unownedChangedPixels, 0);
});

test("native arc publication rejects an injected no-op eraser without publishing", async (t) => {
  const value = fixture(t);
  await assert.rejects(value.build({ ...value.request,
    objects: [{ type: "arc", style: { fill: "none", adjustments: [270, 360] }, box: { x: 0, y: 0, w: 4, h: 4 } }]
  }), /retains owned foreground/);
  assert.equal(fs.existsSync(value.request.outputFile), false);
  assert.deepEqual(fs.readFileSync(value.request.sourceFile), value.sourceBytes);
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
