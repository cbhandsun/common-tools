"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyPrototypeValidationScreenshotPolicy
} = require("../skills/pd-hifi-slideclone/scripts/lib/prototype-validation-screenshot-policy");

test("prototype validation policy preserves UI screenshots and removes fake editable placeholders", () => {
  const page = {
    images: [
      objectifiedImage("main", [nativeText("Live Webpage", "prototype-validation-flow-native-live-label")]),
      objectifiedImage("intent")
    ],
    shapes: [
      shape("intent", "prototype-validation-flow-native-intent-card", { x: 20, y: 150, w: 160, h: 170 }),
      shape("intent", "prototype-validation-flow-native-intent-body-line", { x: 35, y: 300, w: 130, h: 4 }),
      shape("intent", "prototype-validation-flow-native-connector", { x: 180, y: 230, w: 80, h: 1 }, { role: "intent-output-connector" }),
      shape("main", "prototype-validation-flow-native-live-card", { x: 300, y: 80, w: 180, h: 90 }),
      shape("main", "prototype-validation-flow-native-live-card-header", { x: 300, y: 80, w: 180, h: 25 }),
      shape("main", "prototype-validation-flow-native-ui-placeholder", { x: 320, y: 120, w: 60, h: 20 }),
      shape("main", "prototype-validation-flow-native-webpage", { x: 600, y: 210, w: 240, h: 180 }),
      shape("main", "prototype-validation-flow-native-webpage-header", { x: 600, y: 210, w: 240, h: 30 }),
      shape("main", "prototype-validation-flow-native-connector", { x: 480, y: 260, w: 120, h: 1 })
    ],
    textBoxes: []
  };

  const result = applyPrototypeValidationScreenshotPolicy(page);

  assert.equal(result.screenshotRegionCount, 3);
  assert.equal(page.shapes.length, 2);
  assert.ok(page.shapes.every((item) => item.source.nativeComponentGroupId));
  assert.equal(page.images[0].source.prototypeValidationResidualBoxes.length, 3);
  assert.equal(page.images[1].source.prototypeValidationResidualBoxes.length, 1);
  assert.equal(page.images[0].source.prototypeValidationNativeTextBoxes.length, 0);
});

test("prototype validation policy groups materialized screenshot minimum units", () => {
  const page = {
    images: [
      residualImage("intent-document-screenshot"),
      residualImage("live-ui-screenshot"),
      residualImage("webpage-ui-screenshot"),
      residualImage("wand-icon", "magic-wand")
    ],
    shapes: [],
    textBoxes: []
  };

  applyPrototypeValidationScreenshotPolicy(page);

  assert.deepEqual(page.images.map((item) => item.source.nativeComponentGroupId).sort(), [
    "prototype-validation-intent",
    "prototype-validation-live",
    "prototype-validation-output",
    "prototype-validation-transform"
  ]);
});

function objectifiedImage(id, nativeTextBoxes = []) {
  return {
    id,
    source: {
      prototypeValidationFlowObjectified: true,
      prototypeValidationResidualBoxes: id === "main" ? [{ name: "wand-icon", box: { x: 490, y: 220, w: 70, h: 100 } }] : [],
      prototypeValidationNativeTextBoxes: nativeTextBoxes
    }
  };
}

function shape(layerSourceId, detector, box, extra = {}) {
  return { id: `${layerSourceId}-${detector}`, box, source: { layerSourceId, detector, ...extra } };
}

function nativeText(text, detector) {
  return { text, box: { x: 310, y: 90, w: 120, h: 20 }, source: { detector } };
}

function residualImage(name, subtype = "screenshot-or-document-region") {
  return {
    id: `source-${name}`,
    source: { detector: "prototype-validation-flow-residual-crop", expressionSubtype: subtype }
  };
}
