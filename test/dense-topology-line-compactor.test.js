"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compactDenseTopologyLineFamilies } = require("../skills/pd-hifi-slideclone/scripts/lib/dense-topology-line-compactor");

function line(id, box, source = {}, style = {}) {
  return {
    id,
    type: "line",
    box,
    style: { stroke: "#126CB4", strokeWidthPt: 1.2, ...style },
    source: { detector: "dense-network-edge", ...source }
  };
}

test("dense topology compactor batches only explicitly non-semantic line families", () => {
  const shapes = [
    line("edge-1", { x: 10, y: 10, w: 40, h: 0 }, { compactionEligible: true, axis: "h" }),
    line("edge-2", { x: 10, y: 20, w: 40, h: 0 }, { compactionEligible: true, axis: "h" }),
    line("semantic-arrow", { x: 10, y: 30, w: 40, h: 0 }, { compactionEligible: true, semanticConnector: true }, { endArrow: "triangle" }),
    line("labelled-edge", { x: 10, y: 40, w: 40, h: 0 }, { compactionEligible: true, hasEndpointLabel: true }),
    line("unmarked-edge", { x: 10, y: 50, w: 40, h: 0 })
  ];

  const compacted = compactDenseTopologyLineFamilies(shapes, { ownerId: "network", ownerKind: "diagram" });

  const compound = compacted.find((shape) => shape.source?.detector === "dense-network-edge-compound");
  assert.ok(compound);
  assert.equal(compound.type, "freeform");
  assert.equal(compound.source.compactedLineCount, 2);
  assert.equal(compound.source.nativeComponentMinimumUnit, "semantic-path-family");
  assert.equal(compound.style.freeformSegments.length, 4);
  assert.deepEqual(compacted.filter((shape) => shape.type === "line").map((shape) => shape.id).sort(), ["labelled-edge", "semantic-arrow", "unmarked-edge"]);
});

test("dense topology compactor keeps style and axis partitions separate", () => {
  const shapes = [
    line("blue-h-1", { x: 0, y: 0, w: 20, h: 0 }, { compactionEligible: true, axis: "h" }),
    line("blue-h-2", { x: 0, y: 5, w: 20, h: 0 }, { compactionEligible: true, axis: "h" }),
    line("blue-v-1", { x: 30, y: 0, w: 0, h: 20 }, { compactionEligible: true, axis: "v" }),
    line("blue-v-2", { x: 35, y: 0, w: 0, h: 20 }, { compactionEligible: true, axis: "v" }),
    line("green-h-1", { x: 50, y: 0, w: 20, h: 0 }, { compactionEligible: true, axis: "h" }, { stroke: "#39B875" }),
    line("green-h-2", { x: 50, y: 5, w: 20, h: 0 }, { compactionEligible: true, axis: "h" }, { stroke: "#39B875" })
  ];

  const compacted = compactDenseTopologyLineFamilies(shapes, { ownerId: "network" });
  const compounds = compacted.filter((shape) => shape.type === "freeform");

  assert.equal(compounds.length, 3);
  assert.deepEqual(compounds.map((shape) => shape.style.stroke).sort(), ["#126CB4", "#126CB4", "#39B875"]);
  assert.deepEqual(compounds.map((shape) => shape.source.compactedPartition).sort(), ["h", "h", "v"]);
});
