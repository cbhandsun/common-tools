"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createObservedRenderQualityVerifier } = require("../scripts/observed-render-quality");

test("render observation preserves Worker collection, request identity and exact quality", async () => {
  const pages = [path.resolve("page-1.png"), path.resolve("page-2.png")];
  const events = [], quality = Object.freeze({ passed: false, metrics: { pdr: 0.2 } });
  const deck = { pages: [] };
  const verify = createObservedRenderQualityVerifier(async request => {
    assert.equal(request.deck, deck);
    assert.equal(request.referenceQuality, quality);
    await request.collectRenderedPages(pages);
    return quality;
  }, async received => { events.push("observe"); assert.deepEqual(received, pages); });
  const collected = [];
  const result = await verify({ deck, referenceQuality: quality,
    collectRenderedPages: async received => { await Promise.resolve(); events.push("worker"); collected.push(...received); } });
  assert.equal(result, quality);
  assert.deepEqual(collected, pages);
  assert.deepEqual(events, ["worker", "observe"]);
});

test("observation without a Worker collector and repeated cached collection remain supported", async () => {
  let observations = 0;
  const verify = createObservedRenderQualityVerifier(async request => {
    await request.collectRenderedPages([path.resolve("page.png")]);
    return { passed: true };
  }, () => { observations += 1; });
  await verify({}); await verify({});
  assert.equal(observations, 2);
});

test("invalid collectors, requests and rendered page boundaries fail before observation", async () => {
  let observed = 0, called = 0;
  const verify = createObservedRenderQualityVerifier(async request => {
    called += 1; await request.collectRenderedPages(request.testPages);
  }, () => { observed += 1; });
  for (const value of [null, [], { collectRenderedPages: false }, { collectRenderedPages: "callback" }]) {
    await assert.rejects(verify(value), /request/);
  }
  let reads = 0;
  const getter = {}; Object.defineProperty(getter, "deck", { enumerable: true, get() { reads += 1; return {}; } });
  await assert.rejects(verify(getter), /request/);
  await assert.rejects(verify(new Proxy({}, {})), /request/);
  assert.equal(reads, 0); assert.equal(called, 0);
  for (const testPages of [[], new Array(21).fill(path.resolve("x.png")), ["relative.png"], [null], [path.resolve("x.png") + "\0"]]) {
    await assert.rejects(verify({ testPages }), /pages/);
  }
  assert.equal(observed, 0);
});

test("verification, Worker collection and observation failures propagate unchanged", async () => {
  const failure = new Error("bounded diagnostic failure");
  await assert.rejects(createObservedRenderQualityVerifier(async () => { throw failure; }, () => {})({}), e => e === failure);
  const verifier = async request => { await request.collectRenderedPages([path.resolve("x.png")]); return {}; };
  let observed = false;
  await assert.rejects(createObservedRenderQualityVerifier(verifier, () => { observed = true; })({ collectRenderedPages: async () => { throw failure; } }), e => e === failure);
  assert.equal(observed, false);
  await assert.rejects(createObservedRenderQualityVerifier(verifier, async () => { throw failure; })({}), e => e === failure);
  assert.throws(() => createObservedRenderQualityVerifier(null, () => {}), /dependencies/);
});
