"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { promoteOrthogonalConnectorRoutes } = require("../skills/pd-hifi-slideclone/scripts/lib/orthogonal-connector-promotion");

function routeSegment(id, x, y, w, h, extra = {}) {
  return {
    id,
    type: "line",
    box: { x, y, w, h },
    style: { stroke: "#30A76B", strokeWidthPt: 1.5, connectorType: "straight", ...extra.style },
    source: { detector: "workflow-native-review-route", ...extra.source }
  };
}

test("promotes a connected three-segment orthogonal route into one native elbow connector", () => {
  const result = promoteOrthogonalConnectorRoutes([
    routeSegment("route-a", 100, 120, 80, 0),
    routeSegment("route-b", 180, 120, 0, 60),
    routeSegment("route-c", 180, 180, 70, 0, { style: { endArrow: "triangle" } })
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "line");
  assert.equal(result[0].style.connectorType, "elbow-3");
  assert.equal(result[0].style.endArrow, "triangle");
  assert.deepEqual(result[0].box, { x: 100, y: 120, w: 150, h: 60 });
  assert.deepEqual(result[0].source.promotedSegmentIds, ["route-a", "route-b", "route-c"]);
});

test("keeps pixel-measured route segments independent so their bend coordinates remain exact", () => {
  const measured = [
    routeSegment("measured-v1", 10, 10, 0, 20),
    routeSegment("measured-h", 10, 30, 40, 0),
    routeSegment("measured-v2", 50, 30, 0, 20)
  ].map((shape) => ({
    ...shape,
    source: { ...(shape.source || {}), preserveMeasuredSegments: true }
  }));

  const result = promoteOrthogonalConnectorRoutes(measured);

  assert.equal(result.length, 3);
  assert.ok(result.every((shape) => shape.source.nativeConnectorRoute !== true));
});

test("does not collapse branched routes or unrelated icon strokes", () => {
  const branched = [
    routeSegment("route-spine-top", 100, 120, 0, 50),
    routeSegment("route-spine-bottom", 100, 170, 0, 50),
    routeSegment("route-top", 100, 120, 50, 0),
    routeSegment("route-middle", 100, 170, 50, 0),
    routeSegment("route-bottom", 100, 220, 50, 0)
  ];
  const icon = [{
    id: "icon-check-a",
    type: "line",
    box: { x: 10, y: 10, w: 8, h: 8 },
    style: { stroke: "#FFFFFF", strokeWidthPt: 2 },
    source: { detector: "native-icon-detail" }
  }];

  assert.equal(promoteOrthogonalConnectorRoutes(branched).length, 5);
  assert.equal(promoteOrthogonalConnectorRoutes(icon).length, 1);
});

test("does not promote a shared routing trunk with a branch attached at its interior", () => {
  const sharedTrunk = [
    routeSegment("route-top", 100, 120, 80, 0),
    routeSegment("route-trunk", 180, 120, 0, 100),
    routeSegment("route-bottom", 100, 220, 80, 0),
    routeSegment("route-middle-branch", 100, 170, 80, 0)
  ];

  const result = promoteOrthogonalConnectorRoutes(sharedTrunk);

  assert.equal(result.length, 4);
  assert.ok(result.every((shape) => shape.source.nativeConnectorRoute !== true));
  assert.deepEqual(result.map((shape) => shape.id), sharedTrunk.map((shape) => shape.id));
});

test("promotes a thick two-segment elbow arrow into one seamless editable freeform", () => {
  const result = promoteOrthogonalConnectorRoutes([
    routeSegment("thick-route-a", 120, 40, 0, 110, { style: { stroke: "#FF7200", strokeWidthPt: 12 } }),
    routeSegment("thick-route-b", 120, 150, 160, 0, { style: { stroke: "#FF7200", strokeWidthPt: 12, endArrow: "triangle" } })
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].type, "freeform");
  assert.equal(result[0].style.fill, "#FF7200");
  assert.equal(result[0].style.closePath, true);
  assert.equal(result[0].source.solidElbowArrow, true);
  assert.equal(result[0].points.length, 9);
  assert.ok(result[0].points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
});
