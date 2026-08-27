"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_STANDARD_NETWORK_NODES,
  createNetworkNativeShapeToolkit
} = require("../skills/pd-hifi-slideclone/scripts/lib/network-native-shapes");

test("standard native networks place all ray connectors behind all nodes", () => {
  const toolkit = createNetworkNativeShapeToolkit(operations());
  const shapes = toolkit.createStandardShapes({ id: "network" }, network(), searchBox());
  const rays = indexes(shapes, "network-diagram-native-ray");
  const nodes = indexes(shapes, "network-diagram-native-node");

  assert.equal(rays.length, 2);
  assert.equal(nodes.length, 2);
  assert.ok(Math.max(...rays) < Math.min(...nodes));
  assert.equal(shapes.filter((shape) => shape.source?.nativeComponentRole === "search-control").length, 4);
  assert.equal(shapes.filter((shape) => shape.source?.detector === "network-diagram-native-center-emblem").length, 5);
});

test("network center rendering preserves sparse and dense editable emblem structures", () => {
  const toolkit = createNetworkNativeShapeToolkit(operations());
  const sparse = toolkit.createCenterShapes({ id: "sparse" }, network());
  const dense = toolkit.createCenterShapes({ id: "dense" }, {
    ...network(),
    nodes: Array.from({ length: 48 }, (_, index) => node(index + 120, 100))
  });

  assert.deepEqual(sparse.map((shape) => shape.type), ["hexagon", "diamond", "hexagon", "diamond", "rect"]);
  assert.equal(dense.length, 9);
  assert.equal(dense[0].type, "freeform");
  assert.equal(dense[0].points.length, 8);
  assert.ok(dense.every((shape) => shape.source.denseNetworkCenter === true));
});

test("network search controls sanitize identifiers and fail closed on incomplete geometry", () => {
  const toolkit = createNetworkNativeShapeToolkit(operations());
  assert.deepEqual(toolkit.createSearchShapes({}, {}), []);
  assert.deepEqual(toolkit.createSearchShapes({}, { ...searchBox(), cursorBox: { x: 1, y: Number.NaN, w: 0, h: 10 } }), []);

  const shapes = toolkit.createSearchShapes({ id: "../../unsafe name" }, searchBox());
  assert.equal(shapes.length, 4);
  assert.ok(shapes.every((shape) => shape.id.startsWith("unsafe-name-")));
  assert.ok(shapes.every((shape) => shape.source.nativeComponentGroupId === "unsafe-name-network-search-control"));
});

test("standard network rendering bounds malformed and extreme node input", () => {
  const toolkit = createNetworkNativeShapeToolkit(operations());
  assert.deepEqual(toolkit.createStandardShapes({}, { center: null }), []);
  const nodes = [
    { center: null, box: {} },
    { center: { x: Number.MAX_VALUE, y: 1 }, box: { x: 1, y: 1, w: 2, h: 2 } },
    ...Array.from({ length: MAX_STANDARD_NETWORK_NODES + 10 }, (_, index) => node(index + 1, 2, "invalid"))
  ];
  const shapes = toolkit.createStandardShapes({}, { center: { x: 1, y: 1 }, centerBox: { x: 0, y: 0, w: 10, h: 10 }, nodes });
  assert.equal(indexes(shapes, "network-diagram-native-ray").length, MAX_STANDARD_NETWORK_NODES);
  assert.equal(indexes(shapes, "network-diagram-native-node").length, MAX_STANDARD_NETWORK_NODES);
  assert.equal(shapes[0].style.stroke, "#2378D4");
});

test("network native plugin validates each injected service boundary", () => {
  const valid = operations();
  assert.throws(() => createNetworkNativeShapeToolkit([]), /operations must be an object/);
  for (const name of ["regularPolygonPoints", "round", "safeComponentToken"]) {
    assert.throws(() => createNetworkNativeShapeToolkit({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  const failure = new Error("polygon service unavailable");
  const toolkit = createNetworkNativeShapeToolkit(operations({ regularPolygonPoints: () => { throw failure; } }));
  assert.throws(() => toolkit.createCenterShapes({}, { ...network(), nodes: Array.from({ length: 48 }, () => node(1, 1)) }), (error) => error === failure);
});

test("native rebuild delegates standard network and shared controls to the registry", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createNativeRebuilder\("network-native"/);
  assert.match(source, /createStandardShapes: createStandardNetworkDiagramShapesFromRegistry/);
  assert.match(source, /createSearchShapes: createNetworkSearchBoxShapesFromRegistry/);
  assert.doesNotMatch(source, /function createNetworkCenterEmblemShapes|function createNetworkSearchBoxShapes/);
});

function indexes(shapes, detector) {
  return shapes.map((shape, index) => shape.source?.detector === detector ? index : -1).filter((index) => index >= 0);
}

function network() {
  return {
    center: { x: 100, y: 100 },
    centerBox: { x: 80, y: 80, w: 40, h: 40 },
    nodes: [node(140, 100, "#FF0000"), node(100, 140, "#00FF00")]
  };
}

function node(x, y, color = "#123456") {
  return { center: { x, y }, box: { x: x - 4, y: y - 4, w: 8, h: 8 }, color };
}

function searchBox() {
  return {
    box: { x: 10, y: 10, w: 90, h: 24 },
    iconBox: { x: 18, y: 15, w: 10, h: 10 },
    cursorBox: { x: 88, y: 15, w: 0, h: 12 }
  };
}

function operations(overrides = {}) {
  return {
    regularPolygonPoints: (sides) => Array.from({ length: sides }, (_, index) => ({ x: index / sides, y: index / sides })),
    round: (value) => Math.round(value * 1000) / 1000,
    safeComponentToken: (value) => String(value || "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unknown",
    ...overrides
  };
}
