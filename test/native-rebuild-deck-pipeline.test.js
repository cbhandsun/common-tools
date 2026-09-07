"use strict";

require("node:test")("expression summaries keep long preservation reasons as values", () => {
  const assert = require("node:assert/strict");
  const {summarizeExpressionProfile} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");
  const reason = "Preserve complex source illustration and editable labels. ".repeat(3);
  const image = {source:{nonEditableReason:reason,expressionForm:"complex-diagram",expressionSubtype:"diagram",recommendedAction:"preserve"}};
  const profile = summarizeExpressionProfile({pages:[{images:[image,image]}]});
  assert.deepEqual(profile.preserveReasonCounts, [[reason,2]]);
  require("../packages/slideclone-core/deck-ir-tree").validateDeckIrTree({meta:{expressionProfile:profile}});
});

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  composeNativeRebuildDeck,
  createNativePassthroughPage,
  createNativeRebuildPlan,
  createPageProgressLifecycle,
  rebuildStrategyOptions
} = require("../skills/pd-hifi-slideclone/scripts/lib/native-rebuild-deck-pipeline");

function planServices(overrides = {}) {
  return {
    readJson: () => ({ meta: { title: "fixture" }, slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0 }] }),
    sourceNativeSlideMetadata: () => new Map([[0, { nativeObjects: 3 }]]),
    defaultSlide: { widthPt: 960, heightPt: 540 },
    ...overrides
  };
}

test("native rebuild plan normalizes legacy numeric dimensions before entering typed stages", () => {
  const plan = createNativeRebuildPlan({ workDir: "C:/safe", services: planServices({ readJson: () => ({ slideSize: { widthPt: "960", heightPt: "540" }, pages: [] }) }) });
  assert.deepEqual(plan.slideSize, { widthPt: 960, heightPt: 540 });
});

test("native rebuild deck plan owns source, selection, native metadata and progress setup", () => {
  const events = [];
  const plan = createNativeRebuildPlan({
    workDir: "C:/safe/deck.work",
    options: { pages: "1", progressReporter: { emit: (event) => events.push(event) } },
    services: planServices()
  });
  assert.equal(plan.selectedPageTotal, 1);
  assert.equal(plan.sourceNativeSlides.get(0).nativeObjects, 3);
  assert.equal(plan.progressReporter.emit instanceof Function, true);
  assert.deepEqual(events, []);
});

test("native rebuild deck plan rejects empty, malformed, extreme and failed service boundaries", () => {
  assert.throws(() => createNativeRebuildPlan({ workDir: "", services: planServices() }), /work directory/);
  assert.throws(() => createNativeRebuildPlan({ workDir: `C:/${"x".repeat(2049)}`, services: planServices() }), /work directory/);
  assert.throws(() => createNativeRebuildPlan({ workDir: "C:/safe", services: planServices({ readJson: null }) }), /readJson/);
  assert.throws(() => createNativeRebuildPlan({ workDir: "C:/safe", services: planServices({ readJson: () => [] }) }), /source IR/);
  assert.throws(() => createNativeRebuildPlan({ workDir: "C:/safe", services: planServices({ sourceNativeSlideMetadata: () => ({}) }) }), /must be a Map/);
  assert.throws(() => createNativeRebuildPlan({ workDir: "C:/safe", services: planServices({ readJson: () => { throw new Error("read failed"); } }) }), /read failed/);
  assert.throws(() => createNativeRebuildPlan({ workDir: "C:/safe", options: { pages: 0, onlyPages: "1" }, services: planServices() }), /page number/);
  assert.throws(() => createNativeRebuildPlan({ workDir: "C:/safe", services: planServices({ readJson: () => ({ pages: "invalid" }) }) }), /source IR pages/);
});

test("page progress rejects forged collection counts without projecting user content", () => {
  const events = [];
  const lifecycle = createPageProgressLifecycle({
    progressReporter: { emit: (event) => events.push(event) },
    pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1
  });
  lifecycle.complete({ images: { length: "private user content" }, shapes: "private text", textBoxes: { length: -1 } });
  assert.deepEqual([events[1].images, events[1].shapes, events[1].textBoxes], [0, 0, 0]);
  assert.equal(JSON.stringify(events).includes("private"), false);
});

test("page progress lifecycle projects bounded metadata and completes exactly once", () => {
  const events = [];
  const timings = [];
  const lifecycle = createPageProgressLifecycle({
    progressReporter: { emit: (event) => events.push(event) },
    pageIndex: 2,
    selectedPageOrdinal: 0,
    selectedPageTotal: 1,
    pageTimings: timings
  });
  const page = { images: [{}], shapes: [{}, {}], textBoxes: [] };
  assert.equal(lifecycle.complete(page, { cached: true, secret: "must-not-project" }), page);
  assert.equal(events[0].status, "start");
  assert.deepEqual(events[1], {
    phase: "page", status: "done", page: 3, pageIndex: 1, pageTotal: 1,
    elapsedMs: events[1].elapsedMs, images: 1, shapes: 2, textBoxes: 0, cached: true
  });
  assert.equal("secret" in events[1], false);
  assert.equal(timings[0].cached, true);
  assert.throws(() => lifecycle.complete(page), /already complete/);
  assert.throws(() => createPageProgressLifecycle({ progressReporter: {}, pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1 }), /reporter/);
  assert.throws(() => createPageProgressLifecycle({ progressReporter: { emit() {} }, pageIndex: 100001, selectedPageOrdinal: 0, selectedPageTotal: 1 }), /page index/);
});

test("page progress validates position boundaries before sending any event", () => {
  const events = [];
  const valid = { progressReporter: { emit: (event) => events.push(event) }, pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1 };
  for (const invalid of [null, false, "", "secret-index", {}, [], NaN, Infinity, -1, 100001]) {
    assert.throws(() => createPageProgressLifecycle({ ...valid, pageIndex: invalid }), /page index is invalid/);
  }
  for (const invalid of [undefined, 0, -1, false, "", Infinity, 100001]) {
    assert.throws(() => createPageProgressLifecycle({ ...valid, selectedPageTotal: invalid }), /page total is invalid/);
  }
  assert.throws(() => createPageProgressLifecycle({ ...valid, selectedPageOrdinal: 1 }), /exceeds/);
  assert.throws(() => createPageProgressLifecycle(null), /options/);
  assert.equal(events.length, 0);
  createPageProgressLifecycle({ ...valid, pageIndex: "100000", selectedPageOrdinal: "99999", selectedPageTotal: "100000" }).complete(null);
  assert.equal(events[0].page, 100001);
  assert.equal(events[1].images, 0);
});

test("page progress projects only bounded own data without invoking metadata accessors", () => {
  const events = [];
  const timings = [];
  const lifecycle = createPageProgressLifecycle({ progressReporter: { emit(event) { events.push(event); } }, pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1, pageTimings: timings });
  const metadata = Object.assign(Object.create({ cached: true }), {
    imageDecodeMs: 1_000_000_000, pngReadCacheBytes: 1_000_000_001,
    visualFeatureCacheMisses: NaN, visualFeatureCacheEntries: -1,
    pngReadCacheHits: "private", nativePassthrough: false,
    secret: "private"
  });
  Object.defineProperty(metadata, "visualFeatureCacheHits", { enumerable: true, get() { throw new Error("must not execute"); } });
  const page = { images: new Array(1_000_000_001), shapes: [], textBoxes: [] };
  Object.defineProperty(page, "textBoxes", { get() { throw new Error("must not execute"); } });
  lifecycle.complete(page, metadata);
  const done = events[1];
  assert.equal(done.images, 1_000_000_000);
  assert.equal(done.textBoxes, 0);
  assert.equal(done.imageDecodeMs, 1_000_000_000);
  assert.equal(done.nativePassthrough, false);
  for (const field of ["cached", "pngReadCacheBytes", "visualFeatureCacheHits", "visualFeatureCacheMisses", "visualFeatureCacheEntries", "pngReadCacheHits", "secret"]) {
    assert.equal(Object.hasOwn(done, field), false, field);
    assert.equal(Object.hasOwn(timings[0], field), false, field);
  }
  assert.ok(Number.isSafeInteger(done.elapsedMs) && done.elapsedMs >= 0);
  assert.equal(JSON.stringify(events).includes("private"), false);
});

test("page progress propagates sink failures and prevents duplicate completion after failure", () => {
  const failure = new Error("sink failed");
  assert.throws(() => createPageProgressLifecycle({ progressReporter: { emit() { throw failure; } }, pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1 }), (error) => error === failure);
  const timings = [];
  const reporter = { calls: 0, emit() { this.calls++; if (this.calls === 2) throw failure; } };
  const lifecycle = createPageProgressLifecycle({ progressReporter: reporter, pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1, pageTimings: timings });
  assert.throws(() => lifecycle.complete({}), (error) => error === failure);
  assert.throws(() => lifecycle.complete({}), /already complete/);
  assert.equal(reporter.calls, 2);
  assert.equal(timings.length, 0);
});

test("native passthrough page preserves safe native counts and coerces invalid metadata", () => {
  const page = createNativePassthroughPage({
    page: { pageIndex: 7 },
    pageIndex: 0,
    imageFile: "C:/safe/page.png",
    sourceNativeSlide: { nativeObjects: 4, textRuns: -1, shapes: "3", connectors: Number.MAX_VALUE }
  });
  assert.equal(page.pageIndex, 7);
  assert.equal(page.source.nativeObjects, 4);
  assert.equal(page.source.textRuns, 0);
  assert.equal(page.source.shapes, 3);
  assert.equal(page.source.connectors, 0);
  assert.equal(page.preserveTemplateSlide, true);
});

test("native deck composition delegates summaries and normalizes strategy flags", () => {
  const strategyInputs = [];
  const deck = composeNativeRebuildDeck({
    sourceIr: { meta: { title: "fixture" } },
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0 }],
    options: { preserveGraphics: true, objectifyLayerConnectors: "true" },
    services: {
      hybridRebuildStrategyProfile: (value) => { strategyInputs.push(value); return { id: "strategy" }; },
      summarizeLayerProfile: () => ({ totals: { images: 0 } }),
      summarizeExpressionProfile: () => ({ native: 1 })
    }
  });
  assert.equal(deck.meta.title, "fixture");
  assert.equal(deck.meta.rebuildStrategy.id, "strategy");
  assert.equal(strategyInputs[0].preserveGraphics, true);
  assert.equal(strategyInputs[0].objectifyLayerConnectors, false);
  assert.deepEqual(deck.meta.layerProfile, { images: 0 });
  assert.deepEqual(deck.meta.expressionProfile, { native: 1 });
  assert.equal(rebuildStrategyOptions({ splitErasedResidualCrops: true }).splitErasedResidualCrops, true);
});

test("native deck composition fails closed for invalid inputs and service results", () => {
  const services = {
    hybridRebuildStrategyProfile: () => ({}),
    summarizeLayerProfile: () => ({ totals: {} }),
    summarizeExpressionProfile: () => ({})
  };
  assert.throws(() => composeNativeRebuildDeck({ sourceIr: [], slideSize: { widthPt: 1, heightPt: 1 }, pages: [], services }), /source IR/);
  assert.throws(() => composeNativeRebuildDeck({ sourceIr: {}, slideSize: { widthPt: 0, heightPt: 1 }, pages: [], services }), /deck inputs/);
  assert.throws(() => composeNativeRebuildDeck({ sourceIr: {}, slideSize: { widthPt: 1, heightPt: 1 }, pages: [], services: {} }), /hybridRebuildStrategyProfile/);
  assert.throws(() => composeNativeRebuildDeck({
    sourceIr: {}, slideSize: { widthPt: 1, heightPt: 1 }, pages: [],
    services: { ...services, summarizeLayerProfile: () => null }
  }), /layer profile/);
});
