"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readImageReconstructionPolicy: read, assertResolvedImageReconstructionPolicy: verify } = require("../packages/cli/image-reconstruction-policy");
const outputKey = "COMMON_TOOLS_IMAGE_OUTPUT_POLICY", cornerKey = "COMMON_TOOLS_IMAGE_CONNECTOR_CORNER_MODE";

test("image reconstruction deployment policy preserves defaults and every supported mode", () => {
  assert.deepEqual(read({}), { outputPolicy: "source-fidelity", connectorCornerMode: "reroutable-elbow" });
  assert.ok(Object.isFrozen(read({})));
  for (const outputPolicy of ["source-fidelity", "semantic-native"]) {
    for (const connectorCornerMode of ["auto", "rounded-freeform", "reroutable-elbow"]) {
      const environment = { [outputKey]: outputPolicy, [cornerKey]: connectorCornerMode };
      const expected = { outputPolicy, connectorCornerMode };
      assert.deepEqual(read(environment), expected);
      assert.doesNotThrow(() => verify(environment, expected));
      assert.doesNotThrow(() => verify(environment));
    }
  }
});

test("image reconstruction policy rejects empty, malformed and extreme values with a fixed error", () => {
  const marker = "private-do-not-echo";
  for (const value of [null, undefined, "", [], marker, 42, false]) assert.throws(() => read(value), TypeError);
  for (const key of [outputKey, cornerKey]) {
    for (const value of ["", null, false, {}, [], marker, "x".repeat(100000), "semantic-native\0", NaN]) {
      assert.throws(() => read({ [key]: value }), { name: "TypeError", message: "Image reconstruction policy is invalid" });
    }
  }
  assert.throws(() => verify({}, null), TypeError);
  assert.throws(() => verify({}, { outputPolicy: marker }), { name: "TypeError", message: "Image reconstruction policy is invalid" });
});

test("deployment policy never executes proxy traps, getters or coercion", () => {
  let calls = 0;
  const hostile = () => { calls++; throw Error("private-do-not-echo"); };
  const proxy = new Proxy({}, { get: hostile, getOwnPropertyDescriptor: hostile, getPrototypeOf: hostile });
  assert.throws(() => read(proxy), TypeError);
  assert.throws(() => verify({}, proxy), TypeError);
  for (const key of [outputKey, cornerKey]) {
    const environment = {};
    Object.defineProperty(environment, key, { get: hostile });
    assert.throws(() => read(environment), TypeError);
    assert.throws(() => read({ [key]: { toString: hostile, [Symbol.toPrimitive]: hostile } }), TypeError);
    assert.deepEqual(read(Object.create(environment)), read({}));
  }
  const expected = {}; Object.defineProperty(expected, "outputPolicy", { get: hostile });
  assert.throws(() => verify({}, expected), TypeError);
  assert.equal(calls, 0);
});

test("resolved policy rejects missing or changed semantic and connector modes without mutating inputs", () => {
  const expected = Object.freeze({ outputPolicy: "semantic-native", connectorCornerMode: "reroutable-elbow" });
  for (const environment of [{}, { [outputKey]: "source-fidelity" }, { [outputKey]: "semantic-native", [cornerKey]: "rounded-freeform" }]) {
    const before = JSON.stringify(environment);
    assert.throws(() => verify(Object.freeze(environment), expected), /reconstruction policy does not match/u);
    assert.equal(JSON.stringify(environment), before);
  }
});

test("image reconstruction policy regressions are discovered by unified unit and all CI", () => {
  const { discoverTestFiles } = require("../scripts/test-sharded");
  for (const suite of ["unit", "all"]) assert.ok(discoverTestFiles(process.cwd(), suite).some(row => row.file.endsWith("image-reconstruction-policy.test.js")));
});
