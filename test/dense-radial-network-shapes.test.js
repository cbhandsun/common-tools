"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createDenseRadialNetworkShapeToolkit } = require("../skills/pd-hifi-slideclone/scripts/lib/dense-radial-network-shapes");

test("dense radial detailed components place every connector behind every node", () => {
  const toolkit = createDenseRadialNetworkShapeToolkit(operations());
  const shapes = toolkit.createDetailedShapes({ id: "network" }, network(), { box: {} });
  const rayIndexes = indexes(shapes, "network-diagram-native-dense-component-ray");
  const nodeIndexes = indexes(shapes, "network-diagram-native-dense-component-node");

  assert.equal(rayIndexes.length, 4);
  assert.equal(nodeIndexes.length, 4);
  assert.ok(Math.max(...rayIndexes) < Math.min(...nodeIndexes));
  assert.equal(shapes.at(-2).source.detector, "test-search");
  assert.equal(shapes.at(-1).source.detector, "test-center");
});

test("dense radial summary components place fan connectors before summary nodes", () => {
  const toolkit = createDenseRadialNetworkShapeToolkit(operations());
  const shapes = toolkit.createSummaryShapes({ id: "network" }, network());
  const fanIndexes = indexes(shapes, "network-diagram-native-summary-fan");
  const nodeIndexes = indexes(shapes, "network-diagram-native-summary-node");

  assert.equal(fanIndexes.length, 4);
  assert.equal(nodeIndexes.length, 4);
  assert.ok(Math.max(...fanIndexes) < Math.min(...nodeIndexes));
  assert.deepEqual(toolkit.summarizeSectors(network().nodes, network().center).map((sector) => sector.count), [1, 1, 1, 1]);
});

test("dense radial shapes bound malformed nodes, identifiers, and adapter results", () => {
  const toolkit = createDenseRadialNetworkShapeToolkit(operations({
    createCenterShapes: () => ({ unexpected: true }),
    createSearchShapes: () => null
  }));
  assert.deepEqual(toolkit.createDetailedShapes({}, { center: null, nodes: [] }), []);
  const shapes = toolkit.createDetailedShapes({ id: "../../unsafe" }, {
    center: { x: 100, y: 100 },
    nodes: [{ center: null }, { center: { x: Number.MAX_VALUE, y: 1 } }, { center: { x: 120, y: 120 }, color: "invalid" }]
  }, {});
  assert.equal(shapes.length, 2);
  assert.ok(shapes.every((shape) => shape.id.startsWith("dense-radial-network-")));
  assert.equal(shapes[0].style.stroke, "#2378D4");
});

test("dense radial shape plugin validates and propagates every injected service boundary", () => {
  const valid = operations();
  for (const name of ["averageColor", "clamp", "createCenterShapes", "createSearchShapes", "hexToRgb", "normalizeHex", "rgbToHex", "round", "roundedBox"]) {
    assert.throws(() => createDenseRadialNetworkShapeToolkit({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  const failure = new Error("center renderer unavailable");
  const toolkit = createDenseRadialNetworkShapeToolkit(operations({ createCenterShapes: () => { throw failure; } }));
  assert.throws(() => toolkit.createDetailedShapes({}, network()), (error) => error === failure);
});

test("native rebuild delegates dense network component rendering to the registry", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createNativeRebuilder\("network-dense-component"/);
  assert.match(source, /createDetailedShapes: createDetailedDenseRadialNetworkComponentShapesFromRegistry/);
  assert.match(source, /createSummaryShapes: createDenseRadialNetworkSummaryShapesFromRegistry/);
  assert.doesNotMatch(source, /function createDetailedDenseRadialNetworkComponentShapes|function createDenseRadialNetworkSummaryShapes|function denseRadialNetworkSectors/);
});

function indexes(shapes, detector) {
  return shapes.map((shape, index) => shape.source?.detector === detector ? index : -1).filter((index) => index >= 0);
}

function network() {
  return {
    center: { x: 100, y: 100 },
    nodes: [
      { center: { x: 140, y: 100 }, box: { w: 8, h: 8 }, color: "#FF0000" },
      { center: { x: 100, y: 140 }, box: { w: 8, h: 8 }, color: "#00FF00" },
      { center: { x: 60, y: 100 }, box: { w: 8, h: 8 }, color: "#0000FF" },
      { center: { x: 100, y: 60 }, box: { w: 8, h: 8 }, color: "#FFFF00" }
    ]
  };
}

function operations(overrides = {}) {
  return {
    averageColor: (colors) => colors[0] || null,
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    createCenterShapes: () => [{ source: { detector: "test-center" } }],
    createSearchShapes: () => [{ source: { detector: "test-search" } }],
    hexToRgb: (value) => ({ r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16) }),
    normalizeHex: (value, fallback) => /^#[0-9A-F]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback,
    rgbToHex: ({ r, g, b }) => `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`,
    round: (value) => Math.round(value * 1000) / 1000,
    roundedBox: (box) => ({ ...box }),
    ...overrides
  };
}
