"use strict";
const {createSceneGlyphOcclusion,sceneGlyphOcclusionEvidence}=require('../packages/slideclone-core/scene-plan/source-scene-glyph-occlusion');
const test = require("node:test"), assert = require("node:assert/strict");
const { measureSceneContainer } = require("../packages/slideclone-core/scene-plan/source-scene-container");
const { sampleAtomInteriorFill, sampleAtomInteriorFillSeeds } = require("../packages/slideclone-core/scene-plan/visual-atom-interior-fill");
function imageWithPanel(panel) {
  const image = { width: 400, height: 300, rgba: Buffer.alloc(400 * 300 * 4, 255) };
  for (let y = panel.y; y < panel.y + panel.h; y++) for (let x = panel.x; x < panel.x + panel.w; x++)
    image.rgba.set([210, 230, 245, 255], (y * image.width + x) * 4);
  return image;
}
test("a closed taller panel inside existing geometry admission is not censored by the search window", () => {
  const panel = { x: 80, y: 60, w: 160, h: 90 }, hint = { x: 80, y: 75, w: 160, h: 60 }, budget = { used: 0 };
  const fit = measureSceneContainer(imageWithPanel(panel), hint, [], budget);
  assert.ok(fit); assert.deepEqual(fit.box, panel); assert.equal(fit.fill, "#D2E6F5");
  assert.equal(fit.support, 1); assert.ok(budget.used > (160 + 24) * (60 + 24));
  assert.ok(budget.used <= 4000000);
});
test("the successful original window retains its exact measurement and scan cost", () => {
  const panel = { x: 80, y: 75, w: 160, h: 60 }, budget = { used: 0 };
  assert.deepEqual(measureSceneContainer(imageWithPanel(panel), panel, [], budget)?.box, panel);
  assert.equal(budget.used, (160 + 24) * (60 + 24));
});
test("expanded windows still reject clipped, blank and out-of-admission panels", () => {
  const hint = { x: 80, y: 75, w: 160, h: 60 };
  for (const panel of [{ x: 80, y: 0, w: 160, h: 180 }, { x: 80, y: 45, w: 160, h: 110 }])
    assert.equal(measureSceneContainer(imageWithPanel(panel), hint, [], { used: 0 }), null);
  const blank = { width: 400, height: 300, rgba: Buffer.alloc(400 * 300 * 4, 255) };
  assert.equal(measureSceneContainer(blank, hint, [], { used: 0 }), null);
});
test("fallback sampling is charged to the same budget and cannot overrun it", () => {
  const panel = { x: 80, y: 60, w: 160, h: 90 }, hint = { x: 80, y: 75, w: 160, h: 60 };
  const primary = (160 + 24) * (60 + 24), budget = { used: 4000000 - primary };
  assert.throws(() => measureSceneContainer(imageWithPanel(panel), hint, [], budget), /budget/u);
  assert.equal(budget.used, 4000000);
});

test("a pictorial interior cannot suppress independently closed background evidence", () => {
  const panel = { x: 80, y: 60, w: 160, h: 90 }, image = imageWithPanel(panel);
  for (let y = 95; y < 140; y++) for (let x = 140; x < 220; x++)
    image.rgba.set([30, 60, 90, 255], (y * image.width + x) * 4);
  assert.equal(sampleAtomInteriorFill(image, panel), null);
  assert.ok(sampleAtomInteriorFillSeeds(image, panel).some(seed => seed.color === "#D2E6F5"));
  const fit = measureSceneContainer(image, panel, [], { used: 0 });
  assert.ok(fit); assert.deepEqual(fit.box, panel); assert.equal(fit.fill, "#D2E6F5");
  // The image stays intact; seeds do not erase or vectorize pictorial strokes.
  assert.deepEqual([...image.rgba.slice((95 * 400 + 140) * 4, (95 * 400 + 140) * 4 + 4)], [30, 60, 90, 255]);
  assert.throws(() => measureSceneContainer(image, panel, [], { used: 4000000 - 2303 }), /budget/u);
});

test("local seeds cannot rehabilitate invalid parent frames or incomplete geometry", () => {
  const panel = { x: 80, y: 60, w: 160, h: 90 }, image = imageWithPanel(panel);
  for (const box of [{ ...panel, x: -1 }, { ...panel, w: 500 }, { ...panel, h: NaN }, { ...panel, w: 0 }])
    assert.deepEqual(sampleAtomInteriorFillSeeds(image, box), []);
  assert.deepEqual(sampleAtomInteriorFillSeeds(image, panel, Array(10001).fill(panel)), []);
  assert.deepEqual(sampleAtomInteriorFillSeeds({ ...image, rgba: image.rgba.subarray(4) }, panel), []);
  assert.deepEqual(sampleAtomInteriorFillSeeds(image, panel, [panel]), []);
  const clipped = imageWithPanel({ x: 0, y: 0, w: 400, h: 300 });
  for (let y = 95; y < 140; y++) for (let x = 140; x < 220; x++)
    clipped.rgba.set([30, 60, 90, 255], (y * clipped.width + x) * 4);
  assert.equal(measureSceneContainer(clipped, panel, [], { used: 0 }), null);
});

test("container candidates reject foreign, cloned and hostile glyph capabilities before spending source work", () => {
  const panel={x:80,y:60,w:160,h:90},image=imageWithPanel(panel),budget={used:0};
  const token=createSceneGlyphOcclusion(image,[],{widthPt:400,heightPt:300},budget);
  let reads=0;
  const hostile=new Proxy({}, {get(){reads++;throw new Error('token read');},ownKeys(){reads++;throw new Error('token keys');}});
  for(const invalid of [null,{},Object.freeze({...token}),hostile,0,'token']) {
    assert.equal(measureSceneContainer(image,panel,[],budget,invalid),null);
    assert.equal(budget.used,0);
  }
  const otherBudget={used:0};
  assert.equal(measureSceneContainer(image,panel,[],otherBudget,token),null);
  const otherImage={...image,rgba:Buffer.from(image.rgba)};
  assert.equal(measureSceneContainer(otherImage,panel,[],budget,token),null);
  assert.equal(reads,0);assert.equal(budget.used,0);assert.equal(otherBudget.used,0);
  assert.deepEqual(sceneGlyphOcclusionEvidence(token),{glyphMeasurements:0,glyphOwnedPixels:0});
  assert.deepEqual(measureSceneContainer(image,panel,[],budget,token)?.box,panel);
  assert.ok(budget.used>0);
});

test("background silhouette preserves a closed disk with internal glyph holes instead of its enclosing rectangle", () => {
  const image = { width: 160, height: 160, rgba: Buffer.alloc(160 * 160 * 4, 255) };
  for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++)
    if (Math.hypot(x + .5 - 80, y + .5 - 80) <= 40) image.rgba.set([30, 110, 180, 255], (y * 160 + x) * 4);
  const glyph = { x: 72, y: 60, w: 16, h: 40 };
  for (let y = 60; y < 100; y++) for (let x = 72; x < 88; x++) image.rgba.set([255, 255, 255, 255], (y * 160 + x) * 4);
  const budget = { used: 0 }, fit = measureSceneContainer(image, { x: 40, y: 40, w: 80, h: 80 }, [glyph], budget);
  assert.ok(fit?.segments); assert.equal(fit.fill, "#1E6EB4");
  assert.equal(fit.segments.filter(s => s.type === "moveTo").length, 1);
  assert.ok(fit.segments.length <= 120);
  assert.ok(fit.segments.some(s => s.points.some(p => p.x > 0 && p.x < 1)));
  assert.equal(budget.used, 112 * 112);
  assert.equal(image.rgba[(60 * 160 + 72) * 4], 255);
});
