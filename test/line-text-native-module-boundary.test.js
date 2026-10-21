"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const facadePath = require.resolve("../packages/slideclone-core/line-text-native-components");
const analysisPath = require.resolve("../packages/slideclone-core/line-text-native-analysis");
const primitivesPath = require.resolve("../packages/slideclone-core/line-text-native-primitives");
const facade = require(facadePath);
const analysis = require(analysisPath);
const primitives = require(primitivesPath);
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

test("line text native split keeps the public facade stable and dependencies one-way", () => {
  assert.deepEqual(Object.keys(facade).sort(), [
    "createLineTextNativeComponentObjects",
    "createLineTextNativeComponents"
  ]);

  const facadeDependencies = new Set(require.cache[facadePath].children.map((child) => child.id));
  const analysisDependencies = new Set(require.cache[analysisPath].children.map((child) => child.id));
  const primitiveDependencies = new Set(require.cache[primitivesPath].children.map((child) => child.id));
  assert.equal(facadeDependencies.has(analysisPath), true);
  assert.equal(facadeDependencies.has(primitivesPath), true);
  assert.equal(analysisDependencies.has(primitivesPath), true);
  assert.equal(primitiveDependencies.has(facadePath), false);
  assert.equal(primitiveDependencies.has(analysisPath), false);
});

test("line text native helpers preserve normalized lines and editable shape metadata", () => {
  assert.deepEqual(analysis.normalizeLine({
    box: { x: 12.345, y: 40.126, w: 120, h: 0 },
    style: { stroke: "#135CE6" },
    source: { detector: "fixture" }
  }), {
    axis: "h",
    a: 40.13,
    start: 12.35,
    end: 132.35,
    style: { stroke: "#135CE6" },
    source: { detector: "fixture" }
  });

  assert.deepEqual(primitives.nativeRect(
    "fixture-panel",
    { x: 10.004, y: 20.006, w: 80.004, h: 30.006 },
    "line-text-native-section-panel",
    { fill: "#FFFFFF", radiusPt: 0 },
    { evidence: "fixture" }
  ), {
    id: "fixture-panel",
    type: "rect",
    box: { x: 10, y: 20.01, w: 80, h: 30.01 },
    style: { fill: "#FFFFFF", radiusPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "line-text-native-section-panel",
      semanticNativeStructure: true,
      nativeComponentArchetype: "line-text-layout",
      nativeComponentRole: "section-panel",
      evidence: "fixture"
    }
  });
});

test("line text native split helpers ship in the image runtime package", () => {
  for (const file of [
    "packages/slideclone-core/line-text-native-components.js",
    "packages/slideclone-core/line-text-native-analysis.js",
    "packages/slideclone-core/line-text-native-primitives.js"
  ]) {
    assert.equal(IMAGE_EDITABLE_RELEASE_FILES.includes(file), true, file);
  }
});
