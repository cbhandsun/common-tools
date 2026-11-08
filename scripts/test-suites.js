"use strict";

const path = require("path");

const SUITES = Object.freeze(["all", "unit", "contract", "integration", "common-tools"]);
const CONTRACT_TESTS = new Set([
  "openxml-native-relationship-attachments-contract.test.js",
  "openxml-semantic-node-groups-contract.test.js",
  "approved-frame-package.test.js",
  "openxml-whole-relationship-contract.test.js",
  "openxml-component-group-order-contract.test.js",
  "openxml-grouped-residual-layer-contract.test.js",
  "openxml-native-glow-contract.test.js",
  "openxml-shared-edge-capacity-contract.test.js",
  "openxml-native-axis-extent-contract.test.js",
  "openxml-native-route-part-capacity-contract.test.js",
  "openxml-source-corner-mode-contract.test.js",
  "openxml-gradient-angle-contract.test.js",
  "cli-scaffold-generator.test.js",
  "cli-verification-package.test.js",
  "common-tools-project-audit-runtime-package.test.js",
  "engine-core-package.test.js",
  "native-ownership-core-package.test.js",
  "native-text-spacing-contract.test.js",
  "openxml-core-package.test.js",
  "openxml-dotnet-contract.test.js",
  "openxml-native-text-warp-contract.test.js",
  "openxml-paragraph-text-contract.test.js",
  "openxml-native-text-outline-contract.test.js",
  "openxml-native-shadow-scale-contract.test.js",
  "openxml-native-font-typeface-contract.test.js",
  "openxml-native-arc-contract.test.js",
  "openxml-native-opacity-contract.test.js",
  "openxml-native-line-dash-contract.test.js",
  "openxml-native-line-cap-contract.test.js",
  "openxml-native-curve-connector-contract.test.js",
  "openxml-native-path-connector-contract.test.js",
  "openxml-native-freeform-path-contract.test.js",
  "openxml-connector-attachment-contract.test.js",
  "openxml-shared-junction-contract.test.js",
  "openxml-source-bent-gap-contract.test.js",
  "openxml-source-scene-relation-batches-contract.test.js",
  "openxml-source-scene-hollow-ports-contract.test.js",
  "openxml-open-arrow-contract.test.js",
  "package-scripts.test.js",
  "pptx-engine-architecture.test.js",
  "skill-lib-wrapper-boundary.test.js",
  "test-sharded.test.js",
  "workspace-package-boundaries.test.js"
]);
const INTEGRATION_TESTS = new Set([
  "check-common-tools.test.js",
  "common-tools-team-runtime.test.js",
  "libreoffice-gradient-evidence.test.js",
  "libreoffice-connector-evidence.test.js",
  "libreoffice-native-tracks.test.js",
  "libreoffice-grouped-card-connections.test.js",
  "libreoffice-grouped-text-connections.test.js",
  "openxml-template-placeholders.test.js",
  "pptx-package-admission.test.js",
  "ocr-light-ink-color.test.js",
  "worker-budget-runner.test.js",
  "deck-template-openxml-admission.test.js",
  "deck-ir-openxml-admission.test.js",
  "chart-native-render-golden.test.js",
  "complex-graphic-golden-smoke.test.js",
  "common-tools-project-audit.test.js",
  "common-tools-authenticated-job-smoke.test.js",
  "common-tools-ppt-create-openxml-smoke.test.js",
  "common-tools-remote-plugin-bundles.test.js",
  "component-assets-golden-gate.test.js",
  "component-harvest-candidate-rank.test.js",
  "component-harvest-shortlist.test.js",
  "component-render-strategy.test.js",
  "component-replacement-apply-quality-gate.test.js",
  "component-replacement-harvest-queue.test.js",
  "component-replacement-harvest-refresh.test.js",
  "golden-set-runner.test.js",
  "harvest-active-powerpoint-component.test.js",
  "harvest-applied-ppt-components.test.js",
  "ir-delivery-smoke.test.js",
  "libreoffice-benchmark.test.js",
  "libreoffice-core-package.test.js",
  "native-page-lifecycle.test.js",
  "openxml-cache-recovery-smoke.test.js",
  "openxml-native-chart-smoke.test.js",
  "ocr-text-smoke.test.js",
  "ocr-text-quadrilateral.test.js",
  "openxml-reconstruction-e2e-smoke.test.js",
  "openxml-restricted-svg-smoke.test.js",
  "pptx-build-engine-benchmark.test.js",
  "quality-gate-ocr-batch.test.js",
  "quality-gate-output.test.js",
  "quality-gate-real-pptx.test.js",
  "real-pptx-batch-safety.test.js",
  "real-pptx-quality-matrix.test.js",
  "render-libreoffice-adapter.test.js",
  "render-libreoffice.test.js",
  "render-powerpoint-com.test.js",
  "rendered-preview-audit.test.js",
  "rendered-page-snapshot-cache.test.js",
  "rendered-similarity-audit.test.js",
  "rendered-typography-audit.test.js",
  "paragraph-render-feedback.test.js",
  "team-semantic-fallback-smoke.test.js",
  "watch-plugin-component-downloads.test.js"
]);
const INTEGRATION_NAME_HINT = /(smoke|golden|benchmark|quality-gate|real-pptx|render|libreoffice|watch|harvest)/;
const EXTERNAL_PROCESS_HINT = /(libreoffice|powerpoint-com|openxml.*(?:smoke|contract)|render|quality-gate|ocr)/;
const EXTERNAL_PROCESS_TESTS = new Set(["approved-frame-package.test.js", "common-tools-team-runtime.test.js", "common-tools-mcp.test.js", "common-tools-project-audit.test.js", "common-tools-remote-plugin-bundles.test.js", "common-tools-production-preflight.test.js", "powerpoint-roundtrip-targets.test.js", "worker-budget-runner.test.js", "native-text-spacing-contract.test.js", "openxml-template-placeholders.test.js", "pptx-package-admission.test.js", "runtime-shared-route-consumer.test.js", "test-sharded.test.js"]);
const MEMORY_HEAVY_HINT = /^(?:real-pptx-native|component-template-native-shapes|diagram-understanding|visual-atoms)/;
const MEMORY_HEAVY_TESTS = new Set(["common-tools-ppt-ir-editor-browser.test.js"]);

function parseSuite(argv = process.argv.slice(2), env = process.env) {
  const index = argv.lastIndexOf("--suite");
  const raw = index >= 0 ? argv[index + 1] : env.TEST_SUITE || "all";
  if (!SUITES.includes(raw)) {
    throw new Error(`--suite must be one of ${SUITES.join(", ")}; received ${JSON.stringify(raw)}`);
  }
  return raw;
}

function classifyTestFile(file) {
  const name = path.basename(file);
  if (CONTRACT_TESTS.has(name)) return "contract";
  if (INTEGRATION_TESTS.has(name) || classifyTestResource(file) === "external-process") return "integration";
  return "unit";
}

function validateTestSuiteManifest(files) {
  const names = new Set((Array.isArray(files) ? files : []).map((file) => path.basename(file)));
  const errors = [];
  for (const [suite, manifest] of [["contract", CONTRACT_TESTS], ["integration", INTEGRATION_TESTS]]) {
    for (const name of manifest) {
      if (!names.has(name)) errors.push(`${suite} test manifest references a missing file: ${name}`);
    }
  }
  for (const name of names) {
    if (INTEGRATION_NAME_HINT.test(name) && !INTEGRATION_TESTS.has(name)) {
      errors.push(`integration-like test must be explicitly classified: ${name}`);
    }
  }
  return errors;
}

function includesSuite(file, suite) {
  if (suite === "common-tools") return /^common-tools-.*\.test\.js$/.test(path.basename(file));
  return suite === "all" || classifyTestFile(file) === suite;
}

function classifyTestResource(file) {
  const name = path.basename(file);
  if (name === "check-common-tools.test.js" || EXTERNAL_PROCESS_TESTS.has(name) || EXTERNAL_PROCESS_HINT.test(name)) return "external-process";
  if (MEMORY_HEAVY_TESTS.has(name) || MEMORY_HEAVY_HINT.test(name)) return "memory-heavy";
  return "standard";
}

module.exports = {
  SUITES,
  CONTRACT_TESTS,
  INTEGRATION_TESTS,
  classifyTestFile,
  classifyTestResource,
  includesSuite,
  parseSuite,
  validateTestSuiteManifest
};
