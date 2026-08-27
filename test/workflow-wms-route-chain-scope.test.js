"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  workflowWmsRouteOutputBannerBox
} = require("../skills/pd-hifi-slideclone/scripts/lib/workflow-wms-route-chain-scope");
const {
  workflowCollaborationHubLayerStyle
} = require("../skills/pd-hifi-slideclone/scripts/lib/workflow-collaboration-multiplier-scope");

test("WMS output banner spans the measured value panel rather than the OCR text width", () => {
  assert.deepEqual(
    workflowWmsRouteOutputBannerBox({
      panel: { x: 36, y: 348, w: 885, h: 115 },
      outputBox: { x: 149, y: 481, w: 650, h: 17 }
    }),
    { x: 36, y: 469, w: 885, h: 41 }
  );
});

test("WMS output banner ignores incomplete geometry", () => {
  assert.equal(workflowWmsRouteOutputBannerBox({ panel: { x: 36, w: "wide" }, outputBox: { y: 481, h: 17 } }), null);
  assert.equal(workflowWmsRouteOutputBannerBox({ panel: { x: 36, w: 885 }, outputBox: { y: Infinity, h: 17 } }), null);
});

test("collaboration hub layers keep source-tuned highlight and shade opacity", () => {
  assert.deepEqual(workflowCollaborationHubLayerStyle(), {
    highlight: { fill: "#5DE39C", opacity: 0.22 },
    shade: { fill: "#078F78", opacity: 0.14 }
  });
});
