"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { understandDiagramLayer } = require("../packages/slideclone-core/archetypes/diagram-understanding");
const { readinessFor, scoreUnderstanding } = require("../packages/slideclone-core/quality/diagram-metrics");

function flowFixture({ scale = 1, dx = 0, dy = 0, labels = ["First", "Second", "Third"] } = {}) {
  const box = (x, y, w, h) => ({ x: x * scale + dx, y: y * scale + dy, w: w * scale, h: h * scale });
  return {
    item: { box: box(0, 0, 900, 200), source: { expressionForm: "linear-process-diagram" } },
    page: { textBoxes: labels.map((text, i) => ({ id: `t${i}`, text, box: box(60 + i * 270, 60, 100, 40) })) },
    slideSize: { widthPt: 1100 * scale + dx, heightPt: 500 * scale + dy },
    visualAtoms: labels.map((_, i) => ({ id: `n${i}`, kind: "native-rect-candidate", nativeCandidate: true, box: box(40 + i * 270, 40, 160, 80) }))
  };
}

test("text order and container alignment remain hypotheses, not observed relations", () => {
  for (const options of [{}, { scale: 1.6, dx: 17, dy: 31, labels: ["甲", "<script>data</script>", "γ"] }]) {
    const f = flowFixture(options);
    const result = understandDiagramLayer(f.item, f.page, f.slideSize, { visualAtoms: f.visualAtoms });
    assert.equal(result.archetype, "flow-card-chain");
    assert.equal(result.connectorCount, 0);
    assert.deepEqual(result.connectors, []);
    assert.equal(result.connectorHypothesisCount, 2);
    assert.equal(result.connectorHypotheses.length, 2);
    assert.equal(result.visualConnectorCount, 0);
    assert.notEqual(result.nativeReadiness, "native-rebuild");
    assert.equal(result.detectionResult.claimedRegions[0].dropResidual, false);
    assert.equal(result.detectionResult.diagnostics["connector-count"], 0);
    assert.equal(result.detectionResult.diagnostics["connector-hypothesis-count"], 2);
  }
});

test("source connector candidates still permit the existing measured flow path", () => {
  const f = flowFixture();
  const visualAtoms = [...f.visualAtoms,
    { id: "e0", kind: "connector-arrow-candidate", box: { x: 200, y: 76, w: 110, h: 8 } },
    { id: "e1", kind: "connector-arrow-candidate", box: { x: 470, y: 76, w: 110, h: 8 } }
  ];
  const result = understandDiagramLayer(f.item, f.page, f.slideSize, { visualAtoms });
  assert.equal(result.visualConnectorCount, 2);
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.connectorCount, 0);
  assert.equal(result.connectorHypothesisCount, 2);
});

test("inferred relation count cannot raise understanding score or native readiness", () => {
  const base = { archetype: "flow-card-chain", confidence: 0.95, nodes: [{}, {}, {}], connectors: [], residuals: [], item: { source: {} } };
  const inferred = { ...base, connectors: [{ kind: "sequence" }, { kind: "sequence" }] };
  assert.equal(scoreUnderstanding(inferred), scoreUnderstanding(base));
  assert.notEqual(readinessFor(inferred), "native-rebuild");
});

test("grid boundaries cannot supply missing graph relations", () => {
  const f = flowFixture();
  const visualAtoms = [...f.visualAtoms,
    { id: "g0", kind: "grid-line-candidate", box: { x: 0, y: 130, w: 850, h: 2 } },
    { id: "g1", kind: "grid-line-candidate", box: { x: 0, y: 150, w: 850, h: 2 } }
  ];
  const result = understandDiagramLayer(f.item, f.page, f.slideSize, { visualAtoms });
  assert.equal(result.visualConnectorCount, 0);
  assert.notEqual(result.nativeReadiness, "native-rebuild");
});

test("empty diagrams do not invent either relations or relation hypotheses", () => {
  const result = understandDiagramLayer({ box: { x: 0, y: 0, w: 800, h: 400 } }, { textBoxes: [] });
  assert.deepEqual(result.connectors, []);
  assert.deepEqual(result.connectorHypotheses, []);
  assert.equal(result.connectorHypothesisCount, 0);
  assert.equal(result.visualConnectorCount, 0);
  assert.notEqual(result.nativeReadiness, "native-rebuild");
});
