"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createNetworkRebuildOrchestrator } = require("../skills/pd-hifi-slideclone/scripts/lib/network-rebuild-orchestrator");

const MODES = Object.freeze({
  DETAILED: "detailed",
  PRESERVE: "preserve",
  STANDARD: "standard",
  SUMMARY: "summary"
});

test("network orchestrator delegates standard reconstruction and records ownership metadata", () => {
  const image = candidate();
  const orchestrator = createNetworkRebuildOrchestrator(operations());
  const shapes = orchestrator.createShapes([image], {}, { widthPt: 960, heightPt: 540 });

  assert.deepEqual(shapes.map((shape) => shape.id), ["standard"]);
  assert.equal(image.source.networkDiagramObjectified, true);
  assert.equal(image.source.objectifiedNetworkNodes, 24);
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
  assert.match(image.source.nonEditableReason, /rebuilt radial network/);
});

test("network orchestrator preserves dense illustrations and rebuilds only erased search chrome", () => {
  const image = candidate();
  const calls = [];
  const orchestrator = createNetworkRebuildOrchestrator(operations({
    classify: () => MODES.PRESERVE,
    createSearchShapes: () => [{ id: "search" }],
    eraseSearchControl: (...args) => { calls.push(args); return true; }
  }));
  const shapes = orchestrator.createShapes([image], { pixels: true }, { widthPt: 960, heightPt: 540 }, { irDir: "safe" });

  assert.deepEqual(shapes.map((shape) => shape.id), ["search"]);
  assert.equal(calls.length, 1);
  assert.equal(image.source.detector, "dense-radial-network-hero-crop");
  assert.equal(image.source.preserveResidualCropUnderNativeRebuild, true);
  assert.equal(image.source.searchControlErasedFromCrop, true);
  assert.equal(image.source.layer.componentRenderStrategy.mode, "preserve-crop-with-native-overlays");
});

test("network orchestrator keeps detailed and summary branches isolated", () => {
  for (const [mode, expectedId, metadata] of [
    [MODES.DETAILED, "detailed", "denseRadialNetworkComponentObjectified"],
    [MODES.SUMMARY, "summary", "denseRadialNetworkSummarized"]
  ]) {
    const image = candidate();
    const orchestrator = createNetworkRebuildOrchestrator(operations({ classify: () => mode }));
    const shapes = orchestrator.createShapes([image], {});
    assert.deepEqual(shapes.map((shape) => shape.id), [expectedId]);
    assert.equal(image.source[metadata], true);
    assert.equal(image.source.objectifiedNetworkSearchBox, true);
  }
});

test("network orchestrator preserves weak aggregate crops with native fallback overlays", () => {
  const image = candidate();
  const orchestrator = createNetworkRebuildOrchestrator(operations({
    inferNetwork: () => null,
    createAggregateGridShapes: () => [{ id: "grid" }, null, "unsafe"]
  }));
  const shapes = orchestrator.createShapes([image], {});

  assert.deepEqual(shapes.map((shape) => shape.id), ["grid"]);
  assert.equal(image.source.aggregateGridAtomSkeletonObjectified, true);
  assert.equal(image.source.visualAtomOverlayOnly, true);
  assert.match(image.source.nonEditableReason, /preserving the source crop/);
});

test("network orchestrator owns page-level residual aggregation and native promotion", () => {
  const residuals = [pageResidual("left", { x: 40, y: 100, w: 410, h: 300 }), pageResidual("right", { x: 450, y: 100, w: 440, h: 300 })];
  const orchestrator = createNetworkRebuildOrchestrator(operations({
    shouldObjectify: () => true,
    createStandardShapes: () => Array.from({ length: 24 }, (_, index) => ({
      id: `node-${index}`,
      source: { detector: "network-diagram-native-node" }
    }))
  }));
  const candidate = orchestrator.inferPageCandidate({ images: residuals }, { widthPt: 960, heightPt: 540 });
  const shapes = orchestrator.createPageShapes({ pageIndex: 3, images: residuals }, {}, { widthPt: 960, heightPt: 540 });

  assert.ok(candidate && candidate.areaRatio >= 0.18);
  assert.equal(shapes.length, 24);
  assert.ok(shapes.every((shape) => shape.source.pageLevelNetworkObjectified === true));
  assert.deepEqual(shapes[0].source.residualSourceIds, ["left", "right"]);
  assert.ok(residuals.every((item) => item.source.pageLevelNetworkResidualDrop === true));
  assert.deepEqual(orchestrator.createPageShapes({ images: residuals }, {}, null), []);
});

test("network orchestrator fails closed for invalid collections and adapter results", () => {
  const orchestrator = createNetworkRebuildOrchestrator(operations({
    createStandardShapes: () => ({ not: "an array" })
  }));
  assert.deepEqual(orchestrator.createShapes(null, {}), []);
  assert.deepEqual(orchestrator.createShapes([], null), []);
  assert.deepEqual(orchestrator.createShapes([null, {}, candidate()], {}), []);
  assert.equal(orchestrator.createShapes(Array.from({ length: 10_100 }, () => ({})), {}).length, 0);
});

test("network orchestrator validates and propagates its service boundaries", () => {
  const valid = operations();
  assert.throws(() => createNetworkRebuildOrchestrator([]), /operations must be an object/);
  for (const name of [
    "classify", "createAggregateGridShapes", "createDetailedShapes", "createSearchShapes", "createStandardShapes",
    "createSummaryShapes", "eraseSearchControl", "inferNetwork", "inferSearchBox", "shouldObjectify"
  ]) {
    assert.throws(() => createNetworkRebuildOrchestrator({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  assert.throws(() => createNetworkRebuildOrchestrator({ ...valid, modes: {} }), /mode DETAILED/);
  const failure = new Error("classifier failed");
  const orchestrator = createNetworkRebuildOrchestrator(operations({ classify: () => { throw failure; } }));
  assert.throws(() => orchestrator.createShapes([candidate()], {}), (error) => error === failure);
});

test("main network entry is now a thin compatibility wrapper", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createNetworkRebuildOrchestrator\(\{/);
  assert.match(source, /function createNetworkDiagramShapes[\s\S]*?return networkRebuildOrchestrator\.createShapes\(images, sourceImage, slideSize, options\);\s*}/);
  assert.match(source, /function createPageLevelNetworkDiagramShapes[\s\S]*?return networkRebuildOrchestrator\.createPageShapes\(page, sourceImage, slideSize\);\s*}/);
  assert.doesNotMatch(source, /denseNetworkMode === DENSE_RADIAL_NETWORK_MODES/);
  assert.doesNotMatch(source, /function inferPageLevelNetworkCandidate/);
});

function candidate() {
  return { id: "network", source: { reason: "original crop", layer: {} } };
}

function network() {
  return {
    center: { x: 100, y: 100 },
    centerBox: { x: 80, y: 80, w: 40, h: 40 },
    nodes: Array.from({ length: 24 }, (_, index) => ({ center: { x: 120 + index, y: 100 }, box: { x: 0, y: 0, w: 8, h: 8 } }))
  };
}

function pageResidual(id, box) {
  return {
    id,
    box,
    source: {
      detector: "split-wide-residual-crop",
      layer: {
        layerType: "diagram-zone",
        areaRatio: 0.2,
        diagramUnderstanding: {
          archetype: "hub-spoke",
          visualAtomKindCounts: { "grid-line-candidate": 8 }
        }
      }
    }
  };
}

function operations(overrides = {}) {
  return {
    classify: () => MODES.STANDARD,
    createAggregateGridShapes: () => [],
    createDetailedShapes: () => [{ id: "detailed" }],
    createSearchShapes: () => [{ id: "search" }],
    createStandardShapes: () => [{ id: "standard" }],
    createSummaryShapes: () => [{ id: "summary" }],
    eraseSearchControl: () => false,
    inferNetwork: () => network(),
    inferSearchBox: () => ({ box: {}, iconBox: {}, cursorBox: {} }),
    modes: MODES,
    shouldObjectify: (image) => image?.id === "network",
    ...overrides
  };
}
