"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { fixture } = require("./helpers/approved-frame-application.cjs");
const { createApprovedFrameAssetApplication } = require("../packages/slideclone-core/scene-plan/approved-frame-reconstruction");
const { snapshot, parseReview } = require("../packages/slideclone-core/scene-plan/approved-frame-application-input");
const { issueApprovedFrameApplication, finalizeWithApprovedFrames } = require("../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle");

test("review admission rejects empty, unsafe, duplicate and excessive data", t => {
  for (const value of [undefined, null, [], "secret", {}, true]) assert.throws(() => createApprovedFrameAssetApplication(value), TypeError);
  const changes = [r => { r.approvalId = "user-controlled"; }, r => { r.source.width = 0; }, r => { r.source.height = Infinity; },
    r => { r.source.width = 32768; r.source.height = 32768; }, r => { r.source.sha256 = "bad"; }, r => { r.fits.length = 0; },
    r => { r.assets.length = 0; }, r => { r.assets[0].imageId = "../unsafe"; }, r => { r.assets[0].afterFile = "relative.png"; },
    r => { r.assets.push(r.assets[0]); }, r => { r.retirements.push(r.retirements[0]); },
    r => { r.assets = Array(65).fill(r.assets[0]); }, r => { r.retirements = Array(5).fill(r.retirements[0]); },
    r => { r.fits[0].secret = () => "secret"; }];
  for (const change of changes) { const { review } = fixture(t); change(review); assert.throws(() => parseReview(review), TypeError); }
});

test("Proxy traps, getters and serialization hooks execute zero times at both boundaries", async t => {
  const f = fixture(t); let calls = 0;
  const trap = () => { calls++; throw Error("secret"); }, handler = { get: trap, ownKeys: trap, getPrototypeOf: trap };
  for (const key of [null, "source", "fits", "assets"]) {
    const value = structuredClone(f.review);
    if (key) value[key] = new Proxy(value[key], handler);
    assert.throws(() => parseReview(key ? value : new Proxy(value, handler)), TypeError);
  }
  const getter = structuredClone(f.review); Object.defineProperty(getter.assets[0], "afterFile", { get: trap });
  assert.throws(() => parseReview(getter), TypeError);
  const service = createApprovedFrameAssetApplication(f.review);
  await assert.rejects(service(new Proxy(f.context, handler)), TypeError);
  const context = { ...f.context, deck: { ...f.deck, toJSON: trap } };
  await assert.rejects(service(context), TypeError);
  const nested = { ...f.context, deck: { ...f.deck, meta: { get secret() { return trap(); } } } };
  await assert.rejects(service(nested), TypeError);
  assert.equal(calls, 0); assert.deepEqual(f.directories(), []);
});

test("snapshot is bounded, deterministic and does not serialize hooks or cycles", () => {
  assert.equal(snapshot({ b: undefined, a: [undefined, 1] }), '{"a":[null,1]}');
  for (const value of [NaN, Infinity, Symbol("secret"), () => 1, { toJSON() { throw Error("secret"); } }, Array(5)]) assert.throws(() => snapshot(value), TypeError);
  const cycle = {}; cycle.self = cycle; assert.throws(() => snapshot(cycle), TypeError);
  let nested = {}; for (let i = 0; i < 66; i++) nested = { nested }; assert.throws(() => snapshot(nested), RangeError);
  assert.throws(() => snapshot("x".repeat(8 * 1024 * 1024 + 1)), RangeError);
  assert.throws(() => snapshot({ ["x".repeat(8 * 1024 * 1024 + 1)]: 1 }), RangeError);
  assert.throws(() => snapshot(Array(10001).fill(0)), TypeError);
});

test("default service path finalizes normally; serialized, forged, repeated and cross-context receipts reject", async () => {
  const context = {}, result = { ok: true };
  assert.equal(await finalizeWithApprovedFrames(undefined, context, () => result), result);
  for (const receipt of [{}, null, Object.freeze({}), new Proxy({}, {})]) {
    await assert.rejects(finalizeWithApprovedFrames(async () => receipt, context, () => { throw Error("must not finalize"); }), /invalid-approved-frame-application-receipt/u);
  }
  let commits = 0, rollbacks = 0;
  const receipt = issueApprovedFrameApplication(context, { commit() { commits++; }, rollback() { rollbacks++; } });
  await assert.rejects(finalizeWithApprovedFrames(async () => receipt, {}, () => true), /invalid-approved-frame-application-receipt/u);
  assert.equal(await finalizeWithApprovedFrames(async () => receipt, context, () => true), true);
  await assert.rejects(finalizeWithApprovedFrames(async () => receipt, context, () => true), /invalid-approved-frame-application-receipt/u);
  assert.equal(commits, 1); assert.equal(rollbacks, 0);
});

test("asynchronous finalization and rollback failures remain failures", async () => {
  const context = {}; let rolledBack = false;
  const receipt = issueApprovedFrameApplication(context, { commit() { throw Error("must not commit"); }, rollback() { rolledBack = true; } });
  await assert.rejects(finalizeWithApprovedFrames(async () => receipt, context, () => Promise.resolve(true)), /must-be-synchronous/u);
  assert.equal(rolledBack, true);
  const failure = new Error("seal failed"), broken = issueApprovedFrameApplication(context, { commit() {}, rollback() { throw Error("secret path"); } });
  await assert.rejects(finalizeWithApprovedFrames(async () => broken, context, () => { throw failure; }), error => error instanceof AggregateError && error.message === "approved-frame-rollback-failed" && error.errors[0] === failure);
});
