"use strict";

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
