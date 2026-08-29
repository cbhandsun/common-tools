"use strict";

const path = require("path");

const SUITES = Object.freeze(["all", "unit", "contract", "integration"]);
const CONTRACT_TESTS = new Set([
  "cli-scaffold-generator.test.js",
  "openxml-dotnet-contract.test.js",
  "package-scripts.test.js",
  "test-sharded.test.js"
]);
const INTEGRATION_TESTS = new Set([
  "chart-native-render-golden.test.js",
  "complex-graphic-golden-smoke.test.js",
  "common-tools-ppt-create-openxml-smoke.test.js",
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
  "openxml-native-chart-smoke.test.js",
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
  "rendered-similarity-audit.test.js",
  "watch-plugin-component-downloads.test.js"
]);
const INTEGRATION_NAME_HINT = /(smoke|golden|benchmark|quality-gate|real-pptx|render|libreoffice|watch|harvest)/;
const EXTERNAL_PROCESS_HINT = /(libreoffice|powerpoint-com|openxml.*(?:smoke|contract)|render|quality-gate|ocr)/;
const EXTERNAL_PROCESS_TESTS = new Set(["common-tools-mcp.test.js"]);
const MEMORY_HEAVY_HINT = /^(?:real-pptx-native|component-template-native-shapes|diagram-understanding|visual-atoms)/;
const MEMORY_HEAVY_TESTS = new Set(["common-tools-ppt-ir-editor-browser.test.js"]);

function parseSuite(argv = process.argv.slice(2), env = process.env) {
  const index = argv.indexOf("--suite");
  const raw = index >= 0 ? argv[index + 1] : env.TEST_SUITE || "all";
  if (!SUITES.includes(raw)) {
    throw new Error(`--suite must be one of ${SUITES.join(", ")}; received ${JSON.stringify(raw)}`);
  }
  return raw;
}

function classifyTestFile(file) {
  const name = path.basename(file);
  if (INTEGRATION_TESTS.has(name)) return "integration";
  if (CONTRACT_TESTS.has(name)) return "contract";
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
  return suite === "all" || classifyTestFile(file) === suite;
}

function classifyTestResource(file) {
  const name = path.basename(file);
  if (EXTERNAL_PROCESS_TESTS.has(name) || EXTERNAL_PROCESS_HINT.test(name)) return "external-process";
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
