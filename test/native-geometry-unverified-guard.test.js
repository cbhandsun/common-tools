"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { shouldObjectifyStructuredCaseFlowCardChain } = require("../packages/slideclone-core/structured-case-matrix-reconstruction");
const { createVisualAtomNativeShapes } = require("../packages/slideclone-core/visual-atom-native-reconstruction");

function flowCardImage(nativeGeometryUnverified = false) {
  const visualAtoms = [
    { kind: "grid-line-candidate", axis: "h", box: { x: 40, y: 100, w: 400, h: 4 }, nativeCandidate: true },
    { kind: "grid-line-candidate", axis: "h", box: { x: 40, y: 150, w: 400, h: 4 }, nativeCandidate: true },
    { kind: "grid-line-candidate", axis: "v", box: { x: 120, y: 70, w: 4, h: 160 }, nativeCandidate: true },
    { kind: "grid-line-candidate", axis: "v", box: { x: 280, y: 70, w: 4, h: 160 }, nativeCandidate: true },
    { kind: "grid-line-candidate", axis: "v", box: { x: 440, y: 70, w: 4, h: 160 }, nativeCandidate: true },
    { kind: "native-rect-candidate", box: { x: 80, y: 180, w: 90, h: 40 }, color: "#2F80ED", nativeCandidate: true }
  ];
  return {
    id: "structured-case-flow",
    box: { x: 0, y: 0, w: 600, h: 300 },
    source: {
      detector: "structured-case-graphic-underlay-crop",
      layer: {
        layerType: "diagram-zone",
        recommendedAction: "attempt-native-reconstruction",
        diagramUnderstanding: {
          archetype: "flow-card-chain",
          confidence: 0.95,
          nativeReadiness: "native-rebuild",
          evidence: nativeGeometryUnverified ? { nativeGeometryUnverified: true } : {},
          visualAtoms,
          nodes: [
            { id: "one", text: "第一步", box: { x: 50, y: 50, w: 100, h: 30 } },
            { id: "two", text: "第二步", box: { x: 230, y: 50, w: 100, h: 30 } },
            { id: "three", text: "第三步", box: { x: 410, y: 50, w: 100, h: 30 } }
          ]
        }
      }
    }
  };
}

test("native geometry unverified blocks structured-case flow scaffolds only when flagged", () => {
  assert.equal(shouldObjectifyStructuredCaseFlowCardChain(flowCardImage(true)), false);
  assert.equal(shouldObjectifyStructuredCaseFlowCardChain(flowCardImage(false)), true);
});

test("native geometry unverified blocks visual atom rebuilding without changing normal output", () => {
  const flagged = flowCardImage(true);
  const trusted = flowCardImage(false);
  assert.deepEqual(createVisualAtomNativeShapes([flagged]), []);
  assert.ok(createVisualAtomNativeShapes([trusted]).length > 0);
});
