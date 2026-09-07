"use strict";
const { NATIVE_REBUILDER_POLICIES, classifyNativeRebuilderFamily, nativeOwnershipRules } = require("./native-rebuilder-policy");

const { createDetectionResult } = require("./detection-result");
const { createHorizontalStepChainToolkit } = require("./horizontal-step-chain");
const { createHierarchyDiagramToolkit } = require("./hierarchy-diagram");
const { createTriangleTopologyToolkit } = require("./triangle-topology");
const { createCoverEngineCoreToolkit } = require("./cover-engine-core");
const { createDenseRadialNetworkShapeToolkit } = require("./dense-radial-network-shapes");
const { createNetworkNativeShapeToolkit } = require("./network-native-shapes");

const IMPLEMENTATIONS = Object.freeze({
  "network-dense-component": implementation(createDenseRadialNetworkShapeToolkit, ["createDetailedShapes", "createSummaryShapes", "summarizeSectors"]),
  "network-native": implementation(createNetworkNativeShapeToolkit, ["createCenterShapes", "createSearchShapes", "createStandardShapes"]),
  "cover-engine-core": implementation(createCoverEngineCoreToolkit, ["cardTextBox", "componentMetadata", "createShapes", "infer", "shouldObjectify"]),
  "triangle-topology": implementation(createTriangleTopologyToolkit, ["createShapes", "infer", "shouldObjectify"]),
  "hierarchy-diagram": implementation(createHierarchyDiagramToolkit, ["createShapes", "infer", "shouldObjectify"]),
  "horizontal-step-chain": implementation(createHorizontalStepChainToolkit, [
      "inferShapes",
      "isFullyObjectified",
      "nativeTextBoxes",
      "normalizeTextBoxes",
      "shouldObjectify"
    ])
});
const NATIVE_REBUILDER_REGISTRY = Object.freeze(NATIVE_REBUILDER_POLICIES.map((policy) => Object.freeze({
  ...policy, implementation: IMPLEMENTATIONS[policy.id] || null
})));

function implementation(create, capabilities) {
  return Object.freeze({ create, capabilities: Object.freeze([...capabilities]) });
}

function getNativeRebuilderDescriptor(id) {
  return NATIVE_REBUILDER_REGISTRY.find((entry) => entry.id === id) || null;
}

function createNativeRebuilder(id, operations) {
  const descriptor = getNativeRebuilderDescriptor(id);
  if (!descriptor) throw new Error(`unknown native rebuilder family: ${id}`);
  if (!descriptor.implementation) throw new Error(`native rebuilder family has no implementation: ${id}`);
  const rebuilder = descriptor.implementation.create(operations);
  if (!rebuilder || typeof rebuilder !== "object" || Array.isArray(rebuilder)) {
    throw new TypeError(`native rebuilder family returned an invalid implementation: ${id}`);
  }
  for (const capability of descriptor.implementation.capabilities) {
    if (typeof rebuilder[capability] !== "function") {
      throw new TypeError(`native rebuilder family ${id} is missing capability ${capability}`);
    }
  }
  return Object.freeze(rebuilder);
}

function normalizeNativeRebuildResult(id, rawResult = {}, defaults = {}) {
  const descriptor = getNativeRebuilderDescriptor(id);
  if (!descriptor) throw new Error(`unknown native rebuilder family: ${id}`);
  const raw = rawResult && typeof rawResult === "object" && !Array.isArray(rawResult) ? rawResult : {};
  const outputCount = ["shapes", "textBoxes", "images", "tables", "charts"]
    .reduce((sum, key) => sum + (Array.isArray(raw[key]) ? raw[key].length : 0), 0);
  const matched = typeof raw.matched === "boolean" ? raw.matched : outputCount > 0;
  const claimedRegions = Array.isArray(raw.claimedRegions)
    ? raw.claimedRegions
    : (Array.isArray(raw.cropRegions) ? raw.cropRegions.map((box, index) => ({
      id: `${id}-crop-${index + 1}`,
      box,
      purpose: "source-crop",
      dropResidual: false
    })) : []);
  return createDetectionResult({
    matched,
    confidence: raw.confidence ?? defaults.confidence,
    bounds: raw.bounds || defaults.bounds,
    evidence: raw.evidence,
    reasonCodes: raw.reasonCodes || [`${id}.${matched ? "matched" : "no-match"}`],
    claimedRegions,
    diagnostics: {
      "output-count": outputCount,
      "shape-count": Array.isArray(raw.shapes) ? raw.shapes.length : 0,
      "text-count": Array.isArray(raw.textBoxes) ? raw.textBoxes.length : 0,
      "image-count": Array.isArray(raw.images) ? raw.images.length : 0,
      ...(raw.diagnostics || {})
    },
    failureMode: raw.failureMode
  }, defaults);
}

function validateNativeRebuilderRegistry(registry = NATIVE_REBUILDER_REGISTRY) {
  const errors = [];
  if (!Array.isArray(registry) || registry.length === 0) return ["registry must be a non-empty array"];
  const ids = new Set();
  for (const entry of registry) {
    if (!entry || typeof entry !== "object" || !entry.id) {
      errors.push("every registry entry must have an id");
      continue;
    }
    if (ids.has(entry.id)) errors.push(`duplicate family id: ${entry.id}`);
    ids.add(entry.id);
    if (!Array.isArray(entry.matchers) || entry.matchers.some((matcher) => !(matcher instanceof RegExp))) {
      errors.push(`family ${entry.id} must contain RegExp matchers`);
    }
    if (entry.implementation) {
      if (typeof entry.implementation.create !== "function") errors.push(`family ${entry.id} implementation must have a create function`);
      if (!Array.isArray(entry.implementation.capabilities) || entry.implementation.capabilities.length === 0) {
        errors.push(`family ${entry.id} implementation must declare capabilities`);
      } else if (entry.implementation.capabilities.some((capability) => typeof capability !== "string" || !capability)) {
        errors.push(`family ${entry.id} implementation capabilities must be non-empty strings`);
      }
    }
  }
  for (const entry of registry) {
    for (const target of entry?.ownership?.dropFamilies || []) {
      if (!ids.has(target)) errors.push(`family ${entry.id} references unknown drop family ${target}`);
      if (target === entry.id) errors.push(`family ${entry.id} cannot suppress itself`);
    }
  }
  return errors;
}

module.exports = {
  NATIVE_REBUILDER_REGISTRY,
  classifyNativeRebuilderFamily,
  createNativeRebuilder,
  getNativeRebuilderDescriptor,
  nativeOwnershipRules,
  normalizeNativeRebuildResult,
  validateNativeRebuilderRegistry
};
