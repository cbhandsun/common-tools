"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  annotateSystemMapSemantics,
  connectedNodeGroups,
  isConnectorCandidate,
  isNodeCandidate
} = require("../skills/pd-hifi-slideclone/scripts/lib/system-map-semantics");

function node(id, x, y, extra = {}) {
  return { id, type: "rect", box: { x, y, w: 12, h: 12 }, source: { detector: "system-map-native-network-node", ...extra } };
}

function edge(id, x, y, w, h) {
  return { id, type: "line", box: { x, y, w, h }, source: { detector: "system-map-native-network-edge" } };
}

test("system map semantics identifies nodes, connectors and connected groups", () => {
  const result = annotateSystemMapSemantics({
    shapes: [node("a", 100, 100), node("b", 140, 100), node("c", 300, 300), edge("ab", 112, 105, 28, 1)],
    textBoxes: []
  }, { widthPt: 960, heightPt: 540 });
  assert.equal(result.semantics.nodeCount, 3);
  assert.equal(result.semantics.connectorCount, 1);
  assert.equal(result.semantics.nodeGroupCount, 2);
  const annotatedEdge = result.shapes.find((item) => item.id === "ab");
  assert.equal(annotatedEdge.source.systemMapFromNodeId, "a");
  assert.equal(annotatedEdge.source.systemMapToNodeId, "b");
});

test("system map semantics identifies outer unconnected swatch and nearby legend label", () => {
  const result = annotateSystemMapSemantics({
    shapes: [node("legend", 20, 450)],
    textBoxes: [{ id: "label", text: "核心资产", box: { x: 35, y: 448, w: 80, h: 16 }, source: {} }]
  }, { widthPt: 960, heightPt: 540 });
  assert.equal(result.semantics.legendCount, 1);
  assert.equal(result.shapes[0].source.systemMapSemanticRole, "legend-swatch");
  assert.equal(result.textBoxes[0].source.systemMapSemanticRole, "legend-label");
});

test("system map semantic boundaries fail closed and exclude texture", () => {
  assert.equal(isNodeCandidate({ type: "rect", box: { x: 0, y: 0, w: 10, h: 10 }, source: { detector: "system-map-native-asset-grid" } }), false);
  assert.equal(isConnectorCandidate(edge("e", 0, 0, 10, 0)), true);
  assert.deepEqual(connectedNodeGroups([], []), []);
  assert.throws(() => annotateSystemMapSemantics(null, { widthPt: 1, heightPt: 1 }), /must be an object/);
  assert.throws(() => annotateSystemMapSemantics({ shapes: [], textBoxes: [] }, { widthPt: 0, heightPt: 1 }), /slide size/);
  assert.throws(() => annotateSystemMapSemantics({ shapes: Array.from({ length: 100001 }, () => ({})), textBoxes: [] }, { widthPt: 1, heightPt: 1 }), /exceed/);
});
