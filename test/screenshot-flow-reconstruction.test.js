"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createProcessWithScreenshotsFlowObjects
} = require("../packages/slideclone-core/screenshot-flow-reconstruction");

test("process-with-screenshots native styles omit absent options and preserve connector arrows", () => {
  const image = {
    id: "native-graphic-structured-case-underlay",
    box: { x: 44, y: 154, w: 865, h: 357 },
    source: {
      detector: "structured-case-graphic-underlay-crop",
      layer: {
        layerType: "diagram-zone",
        areaRatio: 0.50,
        diagramUnderstanding: { archetype: "process-with-screenshots" }
      }
    }
  };

  const result = createProcessWithScreenshotsFlowObjects([image], null, { widthPt: 960, heightPt: 540 });
  const connectors = result.shapes.filter((shape) => shape.source?.detector === "process-screenshots-native-connector");
  const cards = result.shapes.filter((shape) => shape.source?.detector === "process-screenshots-native-card");

  assert.ok(connectors.some((shape) => shape.style.endArrow === "triangle"));
  assert.ok(connectors.some((shape) => !Object.hasOwn(shape.style, "endArrow")));
  assert.ok(cards.some((shape) => Object.hasOwn(shape.style, "radiusRatio")));
  assert.ok(cards.every((shape) => Object.hasOwn(shape.style, "shadow")));
  assert.doesNotThrow(() => JSON.stringify(result));

  const productWorkflowImage = {
    id: "product-workflow-layer",
    box: { x: 0, y: 162.38, w: 960, h: 346.13 },
    source: {
      detector: "screenshot-process-underlay-crop",
      reason: "product-workflow-icon-process-preserved-as-local-crop",
      layer: { layerType: "screenshot-zone", areaRatio: 0.641, recommendedAction: "preserve-local-crop" }
    }
  };
  const productWorkflow = createProcessWithScreenshotsFlowObjects(
    [productWorkflowImage],
    null,
    { widthPt: 960, heightPt: 540 }
  );
  const workflowCards = productWorkflow.shapes.filter((shape) => shape.source?.detector === "process-screenshots-native-card");

  assert.ok(workflowCards.some((shape) => !Object.hasOwn(shape.style, "radiusRatio")));
  assert.ok(workflowCards.some((shape) => !Object.hasOwn(shape.style, "shadow")));
  assert.doesNotThrow(() => JSON.stringify(productWorkflow));
});
