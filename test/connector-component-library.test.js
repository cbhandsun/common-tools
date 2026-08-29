"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { CONNECTOR_COMPONENT_ROLES, resolveConnectorComponent } = require("../skills/pd-hifi-slideclone/scripts/lib/connector-component-library");

test("connector component library exposes distinct reusable semantic roles", () => {
  assert.deepEqual(CONNECTOR_COMPONENT_ROLES, ["flow", "feedback", "cycle-fixed", "bidirectional", "support", "memory", "hierarchy", "bus"]);
  const flow = resolveConnectorComponent({ role: "flow" });
  const memory = resolveConnectorComponent({ role: "memory" });
  assert.equal(flow.style.connectorType, "curve");
  assert.equal(flow.style.endArrow, "triangle");
  assert.equal(flow.style.startArrow, undefined);
  assert.equal(memory.style.connectorType, "straight");
  assert.equal(memory.style.startArrow, "triangle");
  assert.equal(memory.style.endArrow, "triangle");
});

test("fixed cycle component avoids PowerPoint auto-routing", () => {
  const cycle = resolveConnectorComponent({ role: "cycle-fixed" });
  assert.equal(cycle.type, "shape");
  assert.equal(cycle.style.shapeType, "arc");
  assert.equal(cycle.style.endArrow, "triangle");
  assert.equal(cycle.style.connectorType, undefined);
  assert.equal(cycle.arrowhead.primitive, "native-line-end");
  assert.equal(cycle.arrowhead.placement, "semantic-target");
  assert.equal(cycle.source.routeStability, "fixed-geometry");
  assert.throws(() => resolveConnectorComponent({ role: "cycle-fixed", connectorType: "curve" }), /must be arc/u);
  assert.throws(() => resolveConnectorComponent({ role: "cycle-fixed", direction: "bidirectional" }), /must be forward/u);
  assert.throws(() => resolveConnectorComponent({ role: "cycle-fixed", dash: "dash" }), /must be solid/u);
});

test("connector component library supports bounded visual overrides", () => {
  const component = resolveConnectorComponent({ role: "support", connectorType: "elbow-2", direction: "bidirectional", stroke: "#aabbcc", strokeWidthPt: 2, dash: "dash" });
  assert.equal(component.style.stroke, "#AABBCC");
  assert.equal(component.style.connectorType, "elbow-2");
  assert.equal(component.style.startArrow, "triangle");
  assert.equal(component.style.dash, "dash");
});

test("connector component library rejects unsafe or unsupported input", () => {
  assert.throws(() => resolveConnectorComponent(null), /must be an object/u);
  assert.throws(() => resolveConnectorComponent({ role: "unknown" }), /unsupported connector role/u);
  assert.throws(() => resolveConnectorComponent({ role: "flow", stroke: "red" }), /six-digit hex/u);
  assert.throws(() => resolveConnectorComponent({ role: "flow", strokeWidthPt: 9 }), /between 0.5 and 8/u);
  assert.throws(() => resolveConnectorComponent({ role: "flow", connectorType: "scribble" }), /route is invalid/u);
});
