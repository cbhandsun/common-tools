"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseNativeShadowScale } = require("../packages/slideclone-core/scene-plan/native-shadow-scale");
const { validateDeckPageStructures } = require("../packages/slideclone-core/deck-ir-structure");

test("native shadow scale preserves absent axes and quantizes positive contraction", () => {
  for (const style of [undefined, null, {}, { shadow: undefined }, { shadow: null }, { shadow: {} }])
    assert.deepEqual(parseNativeShadowScale(style), {});
  assert.deepEqual(parseNativeShadowScale({ shadow: { scaleX: 0.95238095238, scaleY: 0.87280701754 } }), { scaleX: 95238, scaleY: 87281 });
  assert.deepEqual(parseNativeShadowScale({ shadow: { scaleX: 0.00001 } }), { scaleX: 1 });
  assert.deepEqual(parseNativeShadowScale({ shadow: { scaleY: 1 } }), { scaleY: 100000 });
  assert.deepEqual(parseNativeShadowScale({ shadow: { scaleX: 0.000025 } }), { scaleX: 3 });
});

test("native shadow scale rejects malformed, extreme and noncanonical fields safely", () => {
  const invalid = [undefined, null, "0.9", false, {}, [], 0, -0, -1, 0.00000999, 1.000001, NaN, Infinity, -Infinity];
  for (const key of ["scaleX", "scaleY"]) for (const value of invalid)
    assert.throws(() => parseNativeShadowScale({ shadow: { [key]: value } }), /native shadow/u);
  for (const style of [{ Shadow: {} }, { shadow: { ScaleX: 0.9 } }, { shadow: { scaley: 0.9 } }, { shadow: "private-token" }, { shadow: [] }])
    assert.throws(() => parseNativeShadowScale(style), error => /native shadow/u.test(error.message) && !error.message.includes("private-token"));
});

test("native shadow scale never executes getters or proxy traps", () => {
  let calls = 0;
  const getter = { get scaleX() { calls++; throw Error("private-token"); } };
  const shadowGetter = { get shadow() { calls++; throw Error("private-token"); } };
  const proxy = new Proxy({}, { get() { calls++; throw Error("private-token"); }, ownKeys() { calls++; throw Error("private-token"); }, getPrototypeOf() { calls++; throw Error("private-token"); } });
  for (const style of [proxy, shadowGetter, { shadow: proxy }, { shadow: getter }, { shadow: new Date() }])
    assert.throws(() => parseNativeShadowScale(style), /native shadow/u);
  assert.equal(calls, 0);
  const style = Object.create(null); style.shadow = Object.assign(Object.create(null), { scaleX: 0.9 });
  assert.deepEqual(parseNativeShadowScale(style), { scaleX: 90000 });
});

test("deck admission checks shadow scaling for each supported visual type", () => {
  for (const type of ["rect", "line", "freeform"]) {
    const shape = { id: "shape", type, box: { x: 0, y: 0, w: 20, h: 20 }, style: { shadow: { scaleX: 0.95 } } };
    assert.doesNotThrow(() => validateDeckPageStructures([{ shapes: [shape] }]));
    shape.style.shadow.scaleX = "private-token";
    assert.throws(() => validateDeckPageStructures([{ shapes: [shape] }]), /native shadow/u);
  }
  const image = { id: "image", box: { x: 0, y: 0, w: 20, h: 20 }, style: { shadow: { scaleY: 0 } } };
  assert.throws(() => validateDeckPageStructures([{ images: [image] }]), /native shadow/u);
});
