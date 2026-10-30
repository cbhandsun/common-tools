// @ts-check
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitApproximateFrame, parseObservation } = require("../packages/slideclone-core/scene-plan/approved-frame-fit.js");
const fs = require("node:fs"), path = require("node:path");
const { patternedSceneFrameGeometry } = require("../packages/slideclone-core/scene-plan/source-scene-patterned-frame");

test("three retained screenshot observations reproduce the reviewed fits and preserve strict rejection", () => {
  const fixtureRoot = path.join(__dirname, "fixtures/approved-frames");
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "fitted-frames.json"), "utf8"));
  for (const frame of expected) {
    const input = JSON.parse(fs.readFileSync(path.join(fixtureRoot, `${frame.id}-input.json`), "utf8"));
    assert.deepEqual(fitApproximateFrame(input), frame);
    assert.deepEqual(frame.approximation.authority, { strictMeasurement: false, sourceFootprint: false, sourceErasure: false });
    const image = { ...input.source, rgba: Buffer.alloc(0) };
    for (const draft of [frame, structuredClone(frame), { ...frame, sourcePixels: [1, 2, 3] }]) {
      assert.equal(patternedSceneFrameGeometry(draft, image), null);
    }
  }
});

function validObservation() {
  const diagonal = 10 - 10 / Math.sqrt(2);
  return { id: "region-fixture", source: { width: 200, height: 160, sha256: "a".repeat(64) }, hint: { x: 10, y: 10, w: 100, h: 80 },
    sides: [
      { name: "top", marks: Array.from({ length: 8 }, (_, i) => ({ x: 20 + 10 * i, y: 10, w: 5, h: 1 })) },
      { name: "bottom", marks: Array.from({ length: 8 }, (_, i) => ({ x: 20 + 10 * i, y: 90, w: 5, h: 1 })) },
      { name: "left", marks: Array.from({ length: 7 }, (_, i) => ({ x: 10, y: 20 + 10 * i, w: 1, h: 5 })) },
      { name: "right", marks: Array.from({ length: 7 }, (_, i) => ({ x: 110, y: 20 + 10 * i, w: 1, h: 5 })) }
    ], corners: [ { name: "tl", points: [ { x: 10 + diagonal, y: 10 + diagonal } ] } ],
    colors: Array.from({ length: 20 }, () => [220, 232, 240]), strict: { accepted: false, failureCodes: ["patterned-corner-unproven"] },
    approval: { enabled: true, id: "user-20261023-approx-frame" } };
}

test("fits four observed rails, a closed-form corner trend, and median dash rhythm", () => {
  const result = fitApproximateFrame(validObservation());
  assert.equal(result.status, "fitted");
  assert.deepEqual(result.geometry?.boxPx, { x: 10, y: 10, w: 100, h: 80 });
  assert.equal(result.geometry?.radiusPx, 10);
  assert.equal(result.geometry?.strokeWidthPx, 1);
  assert.deepEqual(result.geometry?.dashPx, { on: 5, off: 5, phase: null });
  assert.equal(result.geometry?.strokeColor, "#DCE8F0");
  assert.equal(result.geometry?.fill, "none");
});

test("preserves strict failure and never upgrades authority or forwards untrusted fields", () => {
  const input = { ...validObservation(), strictMeasurement: "forged", sourcePixels: [1, 2], erasureToken: "forged", secret: "must-not-appear" };
  const frozen = JSON.stringify(input);
  const result = fitApproximateFrame(input);
  assert.equal(result.status, "fitted");
  assert.deepEqual(result.approximation?.strictResult, input.strict);
  assert.deepEqual(result.approximation?.authority, { strictMeasurement: false, sourceFootprint: false, sourceErasure: false });
  assert(!JSON.stringify(result).includes("must-not-appear"));
  assert(!JSON.stringify(result).includes("forged"));
  assert.equal(JSON.stringify(input), frozen);
});

test("coerces bounded decimal strings and remains deterministic under side ordering", () => {
  const input = validObservation();
  const changed = { ...input, source: { ...input.source, width: "200" }, hint: { ...input.hint, x: "10" }, sides: input.sides.slice().reverse() };
  assert.deepEqual(fitApproximateFrame(changed), fitApproximateFrame(input));
});

test("empty, illegal, unsupported, and missing approval inputs return fixed sanitized failure", () => {
  const input = validObservation();
  for (const value of [undefined, null, [], {}, "user content", { ...input, approval: { enabled: false, id: "x" } },
    { ...input, strict: { accepted: true, failureCodes: [] } }, { ...input, id: "<script>" },
    { ...input, source: { ...input.source, width: Infinity } }, { ...input, source: { ...input.source, sha256: "not-a-hash" } },
    { ...input, hint: { ...input.hint, x: 180 } }]) {
    assert.deepEqual(fitApproximateFrame(value), { status: "unavailable", code: "approx-frame-invalid-input" });
  }
});

test("does not synthesize missing sides, corners, dash evidence, or colors", () => {
  const input = validObservation();
  assert.equal(fitApproximateFrame({ ...input, sides: input.sides.map(s => s.name === "left" ? { ...s, marks: [] } : s) }).code, "approx-frame-four-rails-required");
  assert.equal(fitApproximateFrame({ ...input, corners: [] }).code, "approx-frame-corner-trend-required");
  assert.equal(fitApproximateFrame({ ...input, colors: [] }).code, "approx-frame-color-samples-required");
  assert.equal(fitApproximateFrame({ ...input, sides: input.sides.map(s => ({ ...s, marks: s.marks.map(m => ({ ...m, w: s.name === "top" || s.name === "bottom" ? 11 : 1, h: s.name === "left" || s.name === "right" ? 11 : 1 })) })) }).code, "approx-frame-dash-rhythm-required");
});

test("rejects excessive work, non-finite and off-source coordinates, and sparse arrays", () => {
  const input = validObservation();
  const top = input.sides[0];
  assert(top);
  const sparse = Array(4);
  sparse[0] = top;
  const tooMany = input.sides.map(s => ({ ...s, marks: Array.from({ length: 1100 }, () => s.marks[0]) }));
  for (const bad of [ { ...input, sides: sparse }, { ...input, sides: tooMany },
    { ...input, source: { ...input.source, width: 32768, height: 32768 } },
    { ...input, corners: [{ name: "tl", points: [{ x: NaN, y: 11 }] }] },
    { ...input, colors: [[300, 1, 1]] } ]) {
    assert.equal(fitApproximateFrame(bad).code, "approx-frame-invalid-input");
  }
});

test("rejects getters and prototype payloads without evaluating user accessors", () => {
  let calls = 0;
  const input = validObservation();
  const accessor = Object.defineProperty({}, "source", { enumerable: true, get() { calls++; throw new Error("sensitive data"); } });
  const sides = [ ...input.sides ];
  Object.defineProperty(sides, 0, { enumerable: true, get() { calls++; throw new Error("sensitive data"); } });
  for (const raw of [accessor, { ...input, sides }, Object.create({ approval: input.approval })]) {
    assert.deepEqual(fitApproximateFrame(raw), { status: "unavailable", code: "approx-frame-invalid-input" });
  }
  assert.equal(calls, 0);
});

test("rejects live and revoked Proxies before any reflection, array checks, or user trap", () => {
  let calls = 0;
  const traps = { get() { calls++; throw new Error("private trap"); }, getPrototypeOf() { calls++; throw new Error("private trap"); },
    ownKeys() { calls++; throw new Error("private trap"); }, getOwnPropertyDescriptor() { calls++; throw new Error("private trap"); },
    has() { calls++; throw new Error("private trap"); } };
  const input = validObservation();
  const top = input.sides[0], corner = input.corners[0];
  assert(top && corner);
  const revokedObject = Proxy.revocable({}, traps), revokedArray = Proxy.revocable([], traps);
  revokedObject.revoke(); revokedArray.revoke();
  const values = [ new Proxy(input, traps), revokedObject.proxy, revokedArray.proxy,
    { ...input, source: new Proxy(input.source, traps) }, { ...input, hint: new Proxy(input.hint, traps) },
    { ...input, sides: new Proxy(input.sides, traps) }, { ...input, sides: [new Proxy(top, traps), ...input.sides.slice(1)] },
    { ...input, sides: [{ ...top, marks: new Proxy(top.marks, traps) }, ...input.sides.slice(1)] },
    { ...input, corners: new Proxy(input.corners, traps) }, { ...input, corners: [new Proxy(corner, traps)] },
    { ...input, corners: [{ ...corner, points: new Proxy(corner.points, traps) }] },
    { ...input, colors: new Proxy(input.colors, traps) }, { ...input, colors: [new Proxy([220, 232, 240], traps)] },
    { ...input, strict: new Proxy(input.strict, traps) }, { ...input, approval: new Proxy(input.approval, traps) } ];
  for (const value of values) assert.deepEqual(fitApproximateFrame(value), { status: "unavailable", code: "approx-frame-invalid-input" });
  assert.equal(calls, 0);
});

test("a symbol cannot fill an array hole and symbol accessors do not execute", () => {
  let calls = 0;
  const input = validObservation(), sparse = Array(4);
  sparse[0] = input.sides[0]; sparse[1] = input.sides[1]; sparse[2] = input.sides[2];
  Object.defineProperty(sparse, Symbol("3"), { value: input.sides[3] });
  assert.equal(fitApproximateFrame({ ...input, sides: sparse }).code, "approx-frame-invalid-input");
  const sides = [...input.sides];
  Object.defineProperty(sides, Symbol.iterator, { get() { calls++; throw new Error("private accessor"); } });
  const source = { ...input.source };
  Object.defineProperty(source, Symbol.toStringTag, { get() { calls++; throw new Error("private accessor"); } });
  assert.equal(fitApproximateFrame({ ...input, sides }).code, "approx-frame-invalid-input");
  assert.equal(fitApproximateFrame({ ...input, source }).code, "approx-frame-invalid-input");
  assert.equal(calls, 0);
});

test("array parsing copies numeric descriptors and ignores supplied map and species behavior", () => {
  let calls = 0;
  const input = validObservation(), sides = [...input.sides];
  Object.defineProperty(sides, "map", { value() { calls++; throw new Error("private map"); } });
  const unsafeConstructor = {};
  Object.defineProperty(unsafeConstructor, Symbol.species, { get() { calls++; throw new Error("private species"); } });
  Object.defineProperty(sides, "constructor", { value: unsafeConstructor });
  assert.deepEqual(fitApproximateFrame({ ...input, sides }), fitApproximateFrame(input));
  assert.equal(calls, 0);
});

test("unknown strict diagnostic strings are rejected instead of forwarding user text", () => {
  const input = validObservation();
  const result = fitApproximateFrame({ ...input, strict: { accepted: false, failureCodes: ["sensitive-user-content"] } });
  assert.deepEqual(result, { status: "unavailable", code: "approx-frame-invalid-input" });
  assert(!JSON.stringify(result).includes("sensitive-user-content"));
});

test("rejects excessive record and array property inventories", () => {
  const input = validObservation();
  const excess = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ["unused" + i, i]));
  const sides = [...input.sides];
  Object.assign(sides, excess);
  assert.equal(fitApproximateFrame({ ...input, ...excess }).code, "approx-frame-invalid-input");
  assert.equal(fitApproximateFrame({ ...input, sides }).code, "approx-frame-invalid-input");
});

test("parse copies whitelisted nested geometry instead of retaining caller objects", () => {
  const input = validObservation(), parsed = parseObservation(input);
  assert.notEqual(parsed.hint, input.hint);
  assert.notEqual(parsed.source, input.source);
  assert.notEqual(parsed.strict, input.strict);
  assert.notEqual(parsed.sides[0]?.marks[0], input.sides[0]?.marks[0]);
});

test("large spatial outliers do not move the median rails", () => {
  const input = validObservation();
  const changed = { ...input, sides: input.sides.map(s => s.name === "top" ? { ...s, marks: [ ...s.marks, { x: 25, y: 100, w: 5, h: 1 } ] } : s) };
  const result = fitApproximateFrame(changed);
  assert.equal(result.status, "fitted");
  assert.equal(result.geometry?.boxPx.y, 10);
  assert.equal(result.approximation?.rails.find(s => s.side === "top")?.rejectedMarks, 1);
});
