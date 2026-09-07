"use strict";
// @ts-check
/** @typedef {{dropFamilies: readonly string[], spatial: boolean, minCandidateCoverage: number, preserveDroppedText: boolean, requireMatchingOwnerText: boolean, ownerTextMatch: "same"|"same-or-contained"|"none"}} Ownership */

const NATIVE_REBUILDER_POLICIES = Object.freeze([
  family("network-dense-component", [/^network-diagram-native-(?:dense-component|summary)-/], ownership(["dense-scaffold"])),
  family("network-native", [/^network-diagram-native-(?:ray|node|search-|center-emblem)/], ownership(["visual-atom"])),
  family("cover-engine-core", [/^cover-engine-core-native-/], ownership(["dense-scaffold", "generic-node-skeleton", "visual-atom"])),
  family("skills-engine-ai-comparison", [/^skills-engine-ai-comparison-native-/], ownership(["comparison-matrix", "cycle-hub-spoke"])),
  family("skill-chain-overview", [/^skill-chain-overview-native-/], ownership(["dense-scaffold", "matrix-residual", "sparse-matrix-process-strip", "visual-atom"])),
  family("prototype-validation-flow", [/^prototype-validation-flow-native-/], ownership(["dense-scaffold", "generic-node-skeleton"])),
  family("demand-understanding-flow", [/^demand-understanding-flow-native-/], ownership(["table-zone", "visual-atom"])),
  family("triangle-topology", [/^triangle-topology-native-/], ownership(["generic-node-skeleton", "unclassified-text"], {
    spatial: true,
    minCandidateCoverage: 0.45,
    ownerTextMatch: "same-or-contained"
  })),
  family("four-step-landing-path", [/^four-step-landing-path-native-/], ownership(["visual-atom", "dense-scaffold", "generic-node-skeleton"])),
  family("cli-scaffold-generator", [/^cli-scaffold-generator-native-/], ownership(["visual-atom", "matrix-residual", "table-zone", "dense-scaffold", "generic-node-skeleton"])),
  family("runtime-engine-hybrid", [/^runtime-engine-hybrid-native-/], ownership(["visual-atom", "matrix-residual", "table-zone", "dense-scaffold", "generic-node-skeleton"])),
  family("hierarchy-diagram", [/^hierarchy-diagram-native-/], ownership(["sparse-flow-card-chain"], { preserveDroppedText: true })),
  family("foundation-capability-network", [/^foundation-network-native-/], ownership(["table-zone", "visual-atom"])),
  family("horizontal-step-chain", [/^horizontal-step-chain-native-/], ownership(["visual-atom", "layer-container", "unclassified-text"], {
    spatial: true,
    minCandidateCoverage: 0.45,
    requireMatchingOwnerText: true
  })),
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

/** @param {string} id @param {RegExp[]} matchers @param {Ownership|null} familyOwnership @param {{fallback?: string}} options */
function family(id, matchers, familyOwnership = null, options = {}) {
  return Object.freeze({
    id,
    matchers: Object.freeze([...matchers]),
    ownership: familyOwnership,
    fallback: options.fallback || null
  });
}

/** @param {string[]} dropFamilies @param {Partial<Ownership>} options @returns {Ownership} */
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

/** @param {string} detector @param {{text?: unknown}|null} item */
function classifyNativeRebuilderFamily(detector = "", item = null) {
  const value = String(detector || "");
  if (!value && typeof item?.text === "string") return "unclassified-text";
  const descriptor = NATIVE_REBUILDER_POLICIES.find((entry) => entry.matchers.some((matcher) => matcher.test(value)));
  return descriptor?.id || value;
}

function nativeOwnershipRules() {
  return NATIVE_REBUILDER_POLICIES
    .flatMap((entry) => entry.ownership ? [Object.freeze({ ownerFamily: entry.id, ...entry.ownership })] : []);
}

/** @param {unknown} value @param {number} fallback */
function finiteRatio(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

/** @param {unknown} value @param {unknown} required @returns {Ownership["ownerTextMatch"]} */
function normalizeOwnerTextMatch(value, required) {
  if (value === "same-or-contained") return value;
  return required === true ? "same" : "none";
}

module.exports = { NATIVE_REBUILDER_POLICIES, classifyNativeRebuilderFamily, nativeOwnershipRules };
