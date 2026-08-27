"use strict";

const { createDetectionResult } = require("./detection-result");
const { createHorizontalStepChainToolkit } = require("./horizontal-step-chain");
const { createHierarchyDiagramToolkit } = require("./hierarchy-diagram");
const { createTriangleTopologyToolkit } = require("./triangle-topology");
const { createCoverEngineCoreToolkit } = require("./cover-engine-core");
const { createDenseRadialNetworkShapeToolkit } = require("./dense-radial-network-shapes");
const { createNetworkNativeShapeToolkit } = require("./network-native-shapes");

const NATIVE_REBUILDER_REGISTRY = Object.freeze([
  family("network-dense-component", [/^network-diagram-native-(?:dense-component|summary)-/], ownership(["dense-scaffold"]), {
    implementation: implementation(createDenseRadialNetworkShapeToolkit, ["createDetailedShapes", "createSummaryShapes", "summarizeSectors"])
  }),
  family("network-native", [/^network-diagram-native-(?:ray|node|search-|center-emblem)/], ownership(["visual-atom"]), {
    implementation: implementation(createNetworkNativeShapeToolkit, ["createCenterShapes", "createSearchShapes", "createStandardShapes"])
  }),
  family("cover-engine-core", [/^cover-engine-core-native-/], ownership(["dense-scaffold", "generic-node-skeleton", "visual-atom"]), {
    implementation: implementation(createCoverEngineCoreToolkit, ["cardTextBox", "componentMetadata", "createShapes", "infer", "shouldObjectify"])
  }),
  family("skills-engine-ai-comparison", [/^skills-engine-ai-comparison-native-/], ownership(["comparison-matrix", "cycle-hub-spoke"])),
  family("skill-chain-overview", [/^skill-chain-overview-native-/], ownership(["dense-scaffold", "matrix-residual", "sparse-matrix-process-strip", "visual-atom"])),
  family("prototype-validation-flow", [/^prototype-validation-flow-native-/], ownership(["dense-scaffold", "generic-node-skeleton"])),
  family("demand-understanding-flow", [/^demand-understanding-flow-native-/], ownership(["table-zone", "visual-atom"])),
  family("triangle-topology", [/^triangle-topology-native-/], ownership(["generic-node-skeleton", "unclassified-text"], {
    spatial: true,
    minCandidateCoverage: 0.45,
    ownerTextMatch: "same-or-contained"
  }), {
    implementation: implementation(createTriangleTopologyToolkit, ["createShapes", "infer", "shouldObjectify"])
  }),
  family("four-step-landing-path", [/^four-step-landing-path-native-/], ownership(["visual-atom", "dense-scaffold", "generic-node-skeleton"])),
  family("cli-scaffold-generator", [/^cli-scaffold-generator-native-/], ownership(["visual-atom", "matrix-residual", "table-zone", "dense-scaffold", "generic-node-skeleton"])),
  family("runtime-engine-hybrid", [/^runtime-engine-hybrid-native-/], ownership(["visual-atom", "matrix-residual", "table-zone", "dense-scaffold", "generic-node-skeleton"])),
  family("hierarchy-diagram", [/^hierarchy-diagram-native-/], ownership(["sparse-flow-card-chain"], { preserveDroppedText: true }), {
    implementation: implementation(createHierarchyDiagramToolkit, ["createShapes", "infer", "shouldObjectify"])
  }),
  family("foundation-capability-network", [/^foundation-network-native-/], ownership(["table-zone", "visual-atom"])),
  family("horizontal-step-chain", [/^horizontal-step-chain-native-/], ownership(["visual-atom", "layer-container", "unclassified-text"], {
    spatial: true,
    minCandidateCoverage: 0.45,
    requireMatchingOwnerText: true
  }), {
    implementation: implementation(createHorizontalStepChainToolkit, [
      "inferShapes",
      "isFullyObjectified",
      "nativeTextBoxes",
      "normalizeTextBoxes",
      "shouldObjectify"
    ])
  }),
  family("temporary-answer-workflow", [/^temporary-answer-workflow-native-/], ownership([
    "structured-case-matrix",
    "comparison-matrix",
    "table-zone",
    "visual-atom",
    "matrix-residual",
    "sparse-matrix-process-strip"
  ], { spatial: true, minCandidateCoverage: 0.55 })),
  family("sparse-flow-card-chain", [/^sparse-flow-card-chain-native-/]),
  family("structured-case-matrix", [/^structured-case-matrix-(?:native|semantic)/]),
  family("table-zone", [/^table-zone-(?:native|semantic-native)-/]),
  family("dense-scaffold", [/^dense-complex-diagram-native-scaffold/]),
  family("visual-atom", [/^visual-atom-native-/]),
  family("layer-container", [/^layer-native-container$/]),
  family("generic-node-skeleton", [/^generic-node-diagram-(?:native-skeleton-|semantic-node-text)/]),
  family("comparison-matrix", [/^(?:cycle-illustration-)?comparison-matrix-native-/]),
  family("cycle-hub-spoke", [/^grid-like-cycle-hub-spoke-native-/]),
  family("matrix-residual", [/^matrix-residual-native-skeleton-/]),
  family("sparse-matrix-process-strip", [/^sparse-matrix-process-strip-native-/]),
  family("unclassified-text", [], null, { fallback: "text-without-detector" })
]);

function family(id, matchers, familyOwnership = null, options = {}) {
  return Object.freeze({
    id,
    matchers: Object.freeze([...matchers]),
    ownership: familyOwnership,
    fallback: options.fallback || null,
    implementation: options.implementation || null
  });
}

function implementation(create, capabilities) {
  return Object.freeze({ create, capabilities: Object.freeze([...capabilities]) });
}

function ownership(dropFamilies, options = {}) {
  return Object.freeze({
    dropFamilies: Object.freeze([...dropFamilies]),
    spatial: options.spatial === true,
    minCandidateCoverage: finiteRatio(options.minCandidateCoverage, 0.6),
    preserveDroppedText: options.preserveDroppedText === true,
    requireMatchingOwnerText: options.requireMatchingOwnerText === true,
    ownerTextMatch: normalizeOwnerTextMatch(options.ownerTextMatch, options.requireMatchingOwnerText)
  });
}

function classifyNativeRebuilderFamily(detector = "", item = null) {
  const value = String(detector || "");
  if (!value && typeof item?.text === "string") return "unclassified-text";
  const descriptor = NATIVE_REBUILDER_REGISTRY.find((entry) => entry.matchers.some((matcher) => matcher.test(value)));
  return descriptor?.id || value;
}

function nativeOwnershipRules() {
  return NATIVE_REBUILDER_REGISTRY
    .filter((entry) => entry.ownership)
    .map((entry) => Object.freeze({ ownerFamily: entry.id, ...entry.ownership }));
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

function finiteRatio(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeOwnerTextMatch(value, required) {
  if (value === "same-or-contained") return value;
  return required === true ? "same" : "none";
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
