"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NATIVE_REBUILDER_REGISTRY,
  classifyNativeRebuilderFamily,
  createNativeRebuilder,
  getNativeRebuilderDescriptor,
  nativeOwnershipRules,
  normalizeNativeRebuildResult,
  validateNativeRebuilderRegistry
} = require("../skills/pd-hifi-slideclone/scripts/lib/native-rebuilder-registry");

test("native rebuilder registry is internally complete", () => {
  assert.deepEqual(validateNativeRebuilderRegistry(), []);
  assert.equal(new Set(NATIVE_REBUILDER_REGISTRY.map((entry) => entry.id)).size, NATIVE_REBUILDER_REGISTRY.length);
  assert.equal(Object.isFrozen(NATIVE_REBUILDER_REGISTRY), true);
});

test("native rebuilder registry classifies specialized, fallback, and unknown detectors", () => {
  assert.equal(classifyNativeRebuilderFamily("horizontal-step-chain-native-step-title"), "horizontal-step-chain");
  assert.equal(classifyNativeRebuilderFamily("temporary-answer-workflow-native-cell"), "temporary-answer-workflow");
  assert.equal(classifyNativeRebuilderFamily("", { text: "OCR text" }), "unclassified-text");
  assert.equal(classifyNativeRebuilderFamily("custom-detector"), "custom-detector");
  assert.equal(classifyNativeRebuilderFamily("", {}), "");
});

test("native ownership rules reference registered families only", () => {
  const familyIds = new Set(NATIVE_REBUILDER_REGISTRY.map((entry) => entry.id));
  const rules = nativeOwnershipRules();
  assert.ok(rules.length >= 10);
  for (const rule of rules) {
    assert.ok(familyIds.has(rule.ownerFamily));
    assert.ok(rule.dropFamilies.every((family) => familyIds.has(family)));
  }
});

test("native rebuilder registry constructs and validates a family implementation", () => {
  const descriptor = getNativeRebuilderDescriptor("horizontal-step-chain");
  assert.equal(typeof descriptor.implementation.create, "function");
  assert.ok(descriptor.implementation.capabilities.includes("inferShapes"));

  const operation = () => 0;
  const rebuilder = createNativeRebuilder("horizontal-step-chain", {
    averageColor: operation,
    boxCenterInside: operation,
    centerOfBox: operation,
    comparisonMatrixVisualAtoms: () => [],
    isSafeStructuredText: operation,
    luma: operation,
    normalizeStructuredText: (value) => String(value || ""),
    pixel: () => ({}),
    ptToPxBox: () => ({}),
    rgbToHex: () => "#000000",
    round: Number,
    saturation: operation
  });
  assert.equal(typeof rebuilder.shouldObjectify, "function");
  assert.equal(Object.isFrozen(rebuilder), true);
  assert.throws(() => createNativeRebuilder("missing-family", {}), /unknown native rebuilder family/);
  assert.throws(() => createNativeRebuilder("triangle-topology", {}), /operation boxCenterInside/);
});

test("native rebuilder registry exposes dense network component rendering", () => {
  const descriptor = getNativeRebuilderDescriptor("network-dense-component");
  assert.deepEqual(descriptor.implementation.capabilities, ["createDetailedShapes", "createSummaryShapes", "summarizeSectors"]);
  const operation = () => [];
  const rebuilder = createNativeRebuilder("network-dense-component", {
    averageColor: () => null,
    clamp: Number,
    createCenterShapes: operation,
    createSearchShapes: operation,
    hexToRgb: () => ({}),
    normalizeHex: (_value, fallback) => fallback,
    rgbToHex: () => "#000000",
    round: Number,
    roundedBox: (box) => ({ ...box })
  });
  assert.deepEqual(rebuilder.createDetailedShapes({}, {}), []);
  assert.equal(Object.isFrozen(rebuilder), true);
});

test("native rebuilder registry exposes standard network and shared control rendering", () => {
  const descriptor = getNativeRebuilderDescriptor("network-native");
  assert.deepEqual(descriptor.implementation.capabilities, ["createCenterShapes", "createSearchShapes", "createStandardShapes"]);
  assert.equal(classifyNativeRebuilderFamily("network-diagram-native-ray"), "network-native");
  assert.equal(classifyNativeRebuilderFamily("network-diagram-native-search-box"), "network-native");
  const rebuilder = createNativeRebuilder("network-native", {
    regularPolygonPoints: () => [],
    round: Number,
    safeComponentToken: String
  });
  assert.deepEqual(rebuilder.createStandardShapes({}, {}), []);
  assert.equal(Object.isFrozen(rebuilder), true);
});

test("native rebuilder registry exposes triangle topology through the plugin contract", () => {
  const descriptor = getNativeRebuilderDescriptor("triangle-topology");
  assert.deepEqual(descriptor.implementation.capabilities, ["createShapes", "infer", "shouldObjectify"]);
  const operation = () => null;
  const rebuilder = createNativeRebuilder("triangle-topology", {
    boxCenterInside: operation,
    componentMetadata: () => ({}),
    defaultSlide: { widthPt: 960, heightPt: 540 },
    expandPtBox: (box) => ({ ...box }),
    measurePrimitives: operation,
    nativeTextBoxes: () => [],
    normalizeText: String,
    round: Number,
    sampleArrowFill: operation
  });
  assert.equal(rebuilder.shouldObjectify(null), false);
  assert.deepEqual(rebuilder.createShapes([], [], {}), []);
  assert.equal(Object.isFrozen(rebuilder), true);
});

test("native rebuilder registry exposes hierarchy diagrams through the same plugin contract", () => {
  const descriptor = getNativeRebuilderDescriptor("hierarchy-diagram");
  assert.deepEqual(descriptor.implementation.capabilities, ["createShapes", "infer", "shouldObjectify"]);
  const rebuilder = createNativeRebuilder("hierarchy-diagram", {
    boxCenterInside: () => false,
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    defaultSlide: { widthPt: 960, heightPt: 540 },
    expandPtBox: (box) => ({ ...box }),
    round: Number,
    roundedBox: (box) => ({ ...box }),
    unionPtBox: (left) => ({ ...left })
  });
  assert.equal(rebuilder.shouldObjectify(null), false);
  assert.deepEqual(rebuilder.createShapes([], [], {}), []);
  assert.throws(() => createNativeRebuilder("hierarchy-diagram", {}), /operation boxCenterInside/);
});

test("native rebuilder registry exposes cover engine core through the plugin contract", () => {
  const descriptor = getNativeRebuilderDescriptor("cover-engine-core");
  assert.deepEqual(descriptor.implementation.capabilities, ["cardTextBox", "componentMetadata", "createShapes", "infer", "shouldObjectify"]);
  const operation = () => null;
  const rebuilder = createNativeRebuilder("cover-engine-core", {
    boxCenterInside: operation,
    defaultSlide: { widthPt: 960, heightPt: 540 },
    detectAvatarBox: operation,
    detectAxis: operation,
    detectCardBox: operation,
    expandPtBox: (box) => ({ ...box }),
    normalizeChromeTextBoxes: operation,
    round: Number
  });
  assert.equal(rebuilder.shouldObjectify(null), false);
  assert.deepEqual(rebuilder.createShapes([], [], {}), []);
  assert.equal(Object.isFrozen(rebuilder), true);
});

test("native rebuilder registry validation rejects duplicate and dangling family definitions", () => {
  const invalid = [
    { id: "same", matchers: [/^a/], ownership: { dropFamilies: ["missing"] }, implementation: { create: null, capabilities: [] } },
    { id: "same", matchers: ["not-regex"], ownership: null, implementation: null }
  ];
  const errors = validateNativeRebuilderRegistry(invalid);
  assert.ok(errors.some((error) => error.includes("duplicate family id")));
  assert.ok(errors.some((error) => error.includes("RegExp")));
  assert.ok(errors.some((error) => error.includes("unknown drop family")));
  assert.ok(errors.some((error) => error.includes("implementation must have a create function")));
});

test("native rebuilder results share one safe detection and claim contract", () => {
  const result = normalizeNativeRebuildResult("network-native", {
    shapes: [{ id: "ray" }],
    cropRegions: [{ x: 10, y: 20, w: 30, h: 40 }],
    confidence: 0.88,
    diagnostics: { rayCount: 8, unsafe: "raw user content" }
  });
  assert.equal(result.matched, true);
  assert.equal(result.confidence, 0.88);
  assert.equal(result.claimedRegions[0].purpose, "source-crop");
  assert.equal(result.diagnostics["shape-count"], 1);
  assert.equal(Object.hasOwn(result.diagnostics, "unsafe"), false);
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => normalizeNativeRebuildResult("missing", {}), /unknown native rebuilder family/);
});
