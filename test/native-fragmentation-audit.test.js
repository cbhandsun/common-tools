"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  auditNativeFragmentation,
  detectorFamily,
  nativeBuilderRoot
} = require("../skills/pd-hifi-slideclone/scripts/native-fragmentation-audit");

test("native fragmentation audit treats product brain core value as one component family", () => {
  const detectors = [
    "product-brain-core-value-native-chaos-line",
    "product-brain-core-value-native-person",
    "product-brain-core-value-native-icon",
    "product-brain-core-value-native-output-icon",
    "product-brain-core-value-native-route"
  ];
  const shapes = [];
  for (const detector of detectors) {
    for (let index = 0; index < 4; index += 1) {
      shapes.push({
        id: `${detector}-${index}`,
        type: "line",
        source: {
          detector,
          layerSourceId: "product-brain-core"
        }
      });
    }
  }

  const report = auditNativeFragmentation({
    pages: [{ shapes, textBoxes: [], images: [] }]
  });

  assert.equal(detectorFamily("product-brain-core-value-native-route"), "product-brain-core-value");
  assert.equal(report.totals.fragmentationRisks, 0);
  assert.equal(report.pages[0].layers[0].familyCounts["product-brain-core-value"], 20);
});

test("native fragmentation audit treats product brain asset closure as one component family", () => {
  const detectors = [
    "product-brain-asset-closure-native-input-doc",
    "product-brain-asset-closure-native-screenshot",
    "product-brain-asset-closure-native-funnel",
    "product-brain-asset-closure-native-rule-arrow",
    "product-brain-asset-closure-native-output-screen"
  ];
  const shapes = [];
  for (const detector of detectors) {
    for (let index = 0; index < 4; index += 1) {
      shapes.push({
        id: `${detector}-${index}`,
        type: "rect",
        source: {
          detector,
          layerSourceId: "product-brain-asset-closure"
        }
      });
    }
  }

  const report = auditNativeFragmentation({
    pages: [{ shapes, textBoxes: [], images: [] }]
  });

  assert.equal(detectorFamily("product-brain-asset-closure-native-output-screen"), "product-brain-asset-closure");
  assert.equal(report.totals.fragmentationRisks, 0);
  assert.equal(report.pages[0].layers[0].familyCounts["product-brain-asset-closure"], 20);
});

test("native fragmentation audit groups specialized native parts by their builder root", () => {
  const detectors = [
    "wms-route-chain-native-road-dash",
    "wms-route-chain-native-ai-base",
    "wms-route-chain-native-ai-shield",
    "visual-atom-native-connector"
  ];
  const shapes = detectors.flatMap((detector) => Array.from({ length: 4 }, (_, index) => ({
    id: `${detector}-${index}`,
    type: "shape",
    source: { detector, layerSourceId: "wms-route" }
  })));

  const report = auditNativeFragmentation({ pages: [{ shapes, textBoxes: [], images: [] }] });

  assert.equal(nativeBuilderRoot("wms-route-chain-native-ai-base"), "wms-route-chain");
  assert.deepEqual(report.pages[0].layers[0].primaryBuilderIds, ["wms-route-chain"]);
  assert.equal(report.totals.fragmentationRisks, 0);
});

test("native fragmentation audit still flags two independent builders on one explicit layer", () => {
  const makeShapes = (detector) => Array.from({ length: 4 }, (_, index) => ({
    id: `${detector}-${index}`,
    type: "shape",
    source: { detector, layerSourceId: "shared-layer" }
  }));
  const report = auditNativeFragmentation({
    pages: [{
      shapes: [
        ...makeShapes("alpha-flow-native-card"),
        ...makeShapes("beta-flow-native-node")
      ],
      textBoxes: [],
      images: []
    }]
  });

  assert.equal(report.totals.fragmentationRisks, 1);
  assert.equal(report.fragmentationRisks[0].type, "competing-native-rebuilders");
  assert.deepEqual(report.fragmentationRisks[0].builders.map((item) => item.builderId), ["alpha-flow", "beta-flow"]);
});

test("native fragmentation audit treats scaffold and grid builders as composite helpers", () => {
  const detectors = [
    "structured-illustration-card-native-shell",
    "structured-illustration-output-document-native-icon",
    "table-zone-native-grid-line",
    "dense-complex-diagram-native-scaffold-node"
  ];
  const shapes = detectors.flatMap((detector) => Array.from({ length: 4 }, (_, index) => ({
    id: `${detector}-${index}`,
    type: "shape",
    source: { detector, layerSourceId: "composite-layer" }
  })));
  const report = auditNativeFragmentation({ pages: [{ shapes, textBoxes: [], images: [] }] });

  assert.equal(nativeBuilderRoot("structured-illustration-card-native-shell"), "structured-illustration");
  assert.equal(nativeBuilderRoot("table-zone-native-grid-line"), "");
  assert.equal(nativeBuilderRoot("dense-complex-diagram-native-scaffold-node"), "");
  assert.deepEqual(report.pages[0].layers[0].primaryBuilderIds, ["structured-illustration"]);
  assert.equal(report.totals.fragmentationRisks, 0);
});

test("native fragmentation audit rejects one owner hiding hundreds of shape fragments", () => {
  const shapes = Array.from({ length: 181 }, (_, index) => ({
    id: `system-map-line-${index}`,
    type: "line",
    source: {
      detector: "system-map-native-network-edge",
      layerSourceId: "system-map-layer",
      componentOwnerId: "system-map-component"
    }
  }));

  const report = auditNativeFragmentation({ pages: [{ shapes, textBoxes: [], images: [] }] });

  assert.equal(report.totals.fragmentationRisks, 1);
  assert.equal(report.fragmentationRisks[0].type, "oversized-native-component-owner");
  assert.equal(report.fragmentationRisks[0].shapeCount, 181);
});
