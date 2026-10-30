"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { sourceRouteLocalBackground: measure } = require("../packages/slideclone-core/routing/source-route-local-background");
function fixture() {
  const image = { width: 24, height: 32, rgba: Buffer.alloc(24 * 32 * 4, 255) }, body = new Uint8Array(24 * 32);
  const put = (x, y, rgb) => image.rgba.set([...rgb, 255], (y * 24 + x) * 4);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 24; x++) body[y * 24 + x] = 1;
  for (let y = 5; y < 14; y++) for (let x = 0; x < 24; x++) put(x, y, [255, 205 + (y - 5) * 5, 185 + (y - 5) * 7]);
  return { image, body, background: [255, 255, 255], work: { checks: 0 }, put };
}
test("source flanks observe a body-adjacent smooth field without owning or mutating pixels", () => {
  const f = fixture(), before = Buffer.from(f.image.rgba), body = f.body.slice();
  for (let y = 5; y < 32; y++) f.put(12, y, [150, 40, 10]);
  const nativeBefore = Buffer.from(f.image.rgba), at = measure(f);
  assert.deepEqual(at(5 * 24 + 12), [255, 205, 185]);
  assert.deepEqual(at(30 * 24 + 12), [255, 255, 255]);
  assert.deepEqual(f.image.rgba, nativeBefore); assert.deepEqual(f.body, body);
  assert.notDeepEqual(nativeBefore, before); assert.ok(f.work.checks <= 4000000);
});
test("sharp horizontal branches, unknown flanks and clipped fields cannot become background", () => {
  for (const mutate of [
    f => { for (let x = 0; x < 24; x++) f.put(x, 8, [30, 60, 90]); },
    f => { f.image.rgba[(7 * 24) * 4 + 3] = 0; },
    f => { for (let y = 5; y < 32; y++) for (let x = 0; x < 24; x++) f.put(x, y, [255, 205, 185]); },
    f => { for (let y = 5; y < 14; y++) f.put(23, y, [30, 60, 90]); }
  ]) {
    const f = fixture(); mutate(f); const at = measure(f);
    assert.deepEqual(at(5 * 24 + 12), f.background);
  }
});
test("unanchored fields and exhausted work budgets grant no local field", () => {
  const f = fixture(); f.body.fill(0); assert.deepEqual(measure(f)(5 * 24), f.background);
  const limited = fixture(); limited.work.checks = 4000000;
  assert.deepEqual(measure(limited)(5 * 24), limited.background); assert.ok(limited.work.checks > 4000000);
});
test("empty, malformed, executable and oversized inputs fail closed", () => {
  for (const input of [null, {}, { ...fixture(), background: [] }, { ...fixture(), background: [0, NaN, 0] },
    { ...fixture(), body: undefined }, { ...fixture(), body: new Uint8Array(1) }, { ...fixture(), work: { checks: -1 } },
    { ...fixture(), image: { width: 513, height: 513, rgba: Buffer.alloc(513 * 513 * 4) } }]) assert.throws(() => measure(input));
  let calls = 0;
  assert.throws(() => measure({ get image() { calls++; throw Error("getter"); } }));
  assert.throws(() => measure(new Proxy({}, { get() { calls++; throw Error("proxy"); } })));
  assert.equal(calls, 0);
});
test("background observation is invariant to axis transposition and reverse direction", () => {
  for (const transpose of [false, true]) for (const reverse of [false, true]) {
    const f = fixture(), width = transpose ? f.image.height : f.image.width, height = transpose ? f.image.width : f.image.height;
    const image = { width, height, rgba: Buffer.alloc(width * height * 4) }, body = new Uint8Array(width * height);
    const cell = (x, y) => { const along = reverse ? f.image.height - 1 - y : y; return transpose ? x * width + along : along * width + x; };
    for (let y = 0; y < f.image.height; y++) for (let x = 0; x < f.image.width; x++) {
      const a = y * f.image.width + x, b = cell(x, y);
      image.rgba.set(f.image.rgba.subarray(a * 4, a * 4 + 4), b * 4); body[b] = f.body[a];
    }
    const at = measure({ image, body, background: f.background, work: { checks: 0 } });
    assert.deepEqual(at(cell(12, 5)), [255, 205, 185]);
  }
});
test("new route background tests enter the unified unit and all suites", () => {
  const suites = require("../scripts/test-suites"), runtime = require("../scripts/verify-runtime-package");
  for (const suite of ["unit", "all"]) assert.equal(suites.includesSuite(__filename, suite), true);
  assert.ok(runtime.IMAGE_EDITABLE_RELEASE_FILES.includes("packages/slideclone-core/routing/source-route-local-background.js"));
});
test("only internally measured non-global sections identify an active local background", () => {
  const {hasRouteLocalBackground:active}=require("../packages/slideclone-core/routing/source-route-local-background");
  const f=fixture(),at=measure(f);assert.equal(active(at),true);
  const unanchored=fixture();unanchored.body.fill(0);assert.equal(active(measure(unanchored)),false);
  const flat=fixture();flat.image.rgba.fill(255);assert.equal(active(measure(flat)),false);
  const exhausted=fixture();exhausted.work.checks=4000000;assert.equal(active(measure(exhausted)),false);
  for(const value of [null,undefined,{},()=>at(0),new Proxy(at,{apply(){throw Error("private");}})])assert.equal(active(value),false);
});
