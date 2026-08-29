"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { auditConnectorSemantics, auditConnectorShapes } = require("../skills/pd-hifi-slideclone/scripts/lib/connector-semantic-audit");

const expectation = { id: "perception-to-planning", fromId: "perception", toId: "planning", direction: "forward", axis: "horizontal" };

test("connector semantic audit accepts a forward target arrow on the expected axis", () => {
  const result = auditConnectorSemantics([{
    id: expectation.id, fromId: "perception", toId: "planning",
    arrowAtSource: false, arrowAtTarget: true,
    start: { x: 100, y: 80 }, end: { x: 220, y: 81 },
  }], [expectation]);
  assert.equal(result.passed, true);
  assert.deepEqual(result.findings, []);
});

test("connector semantic audit reports reversed endpoints and reversed arrows", () => {
  const result = auditConnectorSemantics([{
    id: expectation.id, fromId: "planning", toId: "perception",
    arrowAtSource: true, arrowAtTarget: false,
    start: { x: 220, y: 80 }, end: { x: 100, y: 80 },
  }], [expectation]);
  assert.equal(result.passed, false);
  assert.deepEqual(result.findings.map((item) => item.code), [
    "connector-endpoints-reversed-or-mismatched",
    "connector-arrow-direction-mismatch",
  ]);
});

test("connector semantic audit reports auto-routing drift", () => {
  const result = auditConnectorSemantics([{
    id: expectation.id, fromId: "perception", toId: "planning",
    arrowAtSource: false, arrowAtTarget: true,
    start: { x: 100, y: 80 }, end: { x: 220, y: 94 },
  }], [expectation], { axisTolerance: 2 });
  assert.equal(result.passed, false);
  assert.equal(result.findings[0].code, "connector-axis-drift");
});

test("connector semantic audit rejects malformed and excessive input", () => {
  assert.throws(() => auditConnectorSemantics([{ id: "bad" }], [expectation]), /fromId/u);
  assert.throws(() => auditConnectorSemantics([], [], { axisTolerance: 101 }), /axisTolerance/u);
  assert.throws(() => auditConnectorSemantics(Array.from({ length: 5001 }), []), /safety limit/u);
});

test("connector shape audit verifies production IR semantics and arrow placement", () => {
  const result = auditConnectorShapes([{
    id: expectation.id,
    type: "line",
    box: { x: 100, y: 80, w: 120, h: 0.5 },
    style: { connectorType: "straight", endArrow: "triangle" },
    source: { semanticConnector: { fromId: "perception", toId: "planning", direction: "forward", axis: "horizontal" } },
  }], { axisTolerance: 1 });
  assert.equal(result.passed, true);
  assert.equal(result.metrics.connectors, 1);
});

test("connector shape audit fails closed for malformed metadata and axis drift", () => {
  assert.throws(() => auditConnectorShapes([{ id: "bad", box: { x: 0, y: 0, w: 1, h: 1 }, source: { semanticConnector: "bad" } }]), /metadata must be an object/u);
  const result = auditConnectorShapes([{
    id: expectation.id,
    box: { x: 100, y: 80, w: 120, h: 8 },
    style: { endArrow: "triangle" },
    source: { semanticConnector: { fromId: "perception", toId: "planning", direction: "forward", axis: "horizontal" } },
  }], { axisTolerance: 1 });
  assert.equal(result.passed, false);
  assert.equal(result.findings[0].code, "connector-axis-drift");
});
