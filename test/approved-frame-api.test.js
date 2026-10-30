"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const path = require("node:path"), { createRequire } = require("node:module");
const { required } = require("../packages/slideclone-core/scene-plan/approved-frame-bounds");

test("Core exports the opt-in API without depending on a temporary evidence directory", () => {
  const load = createRequire(path.resolve(__dirname, "../packages/slideclone-core/package.json"));
  const api = load("@common-tools/slideclone-core/scene-plan/approved-frame-reconstruction");
  assert.deepEqual(Object.keys(api).sort(), ["fitApproximateFrame", "createApprovedApproxFrameDrawSession", "buildApproximateBackgroundPlan", "applyApproximateBackgroundPlan", "applyApprovedFrameErasureReplay", "createApprovedFrameAssetApplication", "createApprovedBackdropPixelApplication", "createApprovedBackdropPixelReplay", "createApprovedOpaqueBackdropApplication", "composeApprovedAssetApplications"].sort());
  assert.deepEqual(api.fitApproximateFrame(null), { status: "unavailable", code: "approx-frame-invalid-input" });
  for (const call of [api.createApprovedApproxFrameDrawSession, api.buildApproximateBackgroundPlan, api.applyApproximateBackgroundPlan, api.applyApprovedFrameErasureReplay, api.createApprovedBackdropPixelApplication, api.createApprovedOpaqueBackdropApplication, api.composeApprovedAssetApplications]) assert.throws(() => call(null), TypeError);
});

test("internal bounds failures reject instead of substituting colours or geometry", () => {
  assert.equal(required([7], 0), 7);
  assert.equal(required(new Uint8Array([0]), 0), 0);
  for (const [array, index] of [[[], 0], [[1], -1], [[1], 1], [new Uint8Array(0), 0]]) {
    assert.throws(() => required(array, index), { name: "RangeError", message: "approx-frame-array-boundary" });
  }
});
