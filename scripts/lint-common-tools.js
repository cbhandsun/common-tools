#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const eslintFixedArgs = [
  "--cache",
  "--cache-location",
  ".cache/eslint/"
];

function legacySkillScript(relativePath) {
  return ["skills", "pd-hifi-slideclone", "scripts", relativePath].join("/");
}

const eslintTargets = [
  "packages/*/*.js",
  "packages/*/bin/**/*.js",
  "packages/*/verification/**/*.js",
  "scripts/*.js",
  legacySkillScript("lib/render-cache-metadata.js"),
  "packages/slideclone-native-engine/scripts/batch-native-audit-summary.js",
  "packages/slideclone-native-engine/scripts/component-asset-manifest.js",
  "packages/slideclone-native-engine/scripts/component-asset-self-fidelity.js",
  "packages/slideclone-native-engine/scripts/component-asset-self-fidelity-batch.js",
  "packages/slideclone-native-engine/scripts/chart-native-render-golden-smoke.js",
  "packages/slideclone-native-engine/scripts/component-adoption-ab-gate.js",
  "packages/slideclone-native-engine/scripts/component-coverage-matrix.js",
  "packages/slideclone-native-engine/scripts/component-plugin-apply-session-gate.js",
  "packages/slideclone-native-engine/scripts/component-plugin-apply-session.js",
  "packages/slideclone-native-engine/scripts/complex-graphic-golden-smoke.js",
  "packages/slideclone-native-engine/scripts/component-gap-learning-plan.js",
  "packages/slideclone-native-engine/scripts/component-library-materialize.js",
  "packages/slideclone-native-engine/scripts/component-library-refresh.js",
  "packages/slideclone-native-engine/scripts/component-library-storage-audit.js",
  "packages/slideclone-native-engine/scripts/component-ir-replacement-apply-batch.js",
  "packages/slideclone-native-engine/scripts/component-ir-replacement-apply-plan.js",
  "packages/slideclone-native-engine/scripts/component-ir-replacement-close-loop.js",
  "packages/slideclone-native-engine/scripts/component-ir-replacement-object-audit.js",
  "packages/slideclone-native-engine/scripts/component-ir-visual-regression-audit.js",
  "packages/slideclone-native-engine/scripts/component-ir-replacement-plan.js",
  "packages/slideclone-native-engine/scripts/component-isolated-collection-session.js",
  "packages/slideclone-native-engine/scripts/component-learning-wave.js",
  "packages/slideclone-native-engine/scripts/component-strategy-rebuild-page-shards.js",
  "packages/slideclone-native-engine/scripts/component-strategy-rebuild-parallel.js",
  "packages/slideclone-native-engine/scripts/expression-policy-repair-queue.js",
  "packages/slideclone-native-engine/scripts/flow-e2e-matrix.js",
  "packages/slideclone-native-engine/scripts/flow-e2e-smoke.js",
  "packages/slideclone-native-engine/scripts/component-harvest-shortlist.js",
  "packages/slideclone-native-engine/scripts/component-harvest-candidate-rank.js",
  "packages/slideclone-native-engine/scripts/graphic-reconstruction-decision-gate.js",
  "packages/slideclone-native-engine/scripts/graphic-reconstruction-decision-audit.js",
  "packages/slideclone-native-engine/scripts/harvest-active-powerpoint-component.js",
  "packages/slideclone-native-engine/scripts/ir-delivery-smoke.js",
  "packages/slideclone-native-engine/scripts/islide-component-search.js",
  "packages/slideclone-native-engine/scripts/native-fragmentation-audit.js",
  "packages/slideclone-native-engine/scripts/render-engine-report.js",
  "packages/slideclone-native-engine/scripts/real-blind-layer-audit-parallel.js",
  "packages/slideclone-native-engine/scripts/real-blind-layer-audit.js",
  "packages/slideclone-native-engine/scripts/minimum-unit-gap-audit.js",
  "packages/slideclone-native-engine/scripts/pptx-build-engine-benchmark.js",
  "packages/slideclone-native-engine/scripts/minimum-unit-gap-repair-runner.js",
  "packages/slideclone-native-engine/scripts/minimum-unit-gap-repair-merge.js",
  "packages/slideclone-native-engine/scripts/component-assets-golden-gate.js",
  "packages/slideclone-native-engine/scripts/minimum-unit-policy-gate.js",
  "packages/slideclone-native-engine/scripts/ocr-text-smoke.js",
  "packages/slideclone-native-engine/scripts/officeplus-component-resolve.js",
  "packages/slideclone-native-engine/scripts/officeplus-component-search.js",
  "packages/slideclone-native-engine/scripts/plugin-component-inventory.js",
  "packages/slideclone-native-engine/scripts/plugin-component-target-audit.js",
  "packages/slideclone-native-engine/scripts/component-motif-recall-report.js",
  "packages/slideclone-native-engine/scripts/component-native-promotion-batch.js",
  "packages/slideclone-native-engine/scripts/component-native-promotion-gate.js",
  "packages/slideclone-native-engine/scripts/component-replacement-apply.js",
  "packages/slideclone-native-engine/scripts/component-replacement-apply-batch.js",
  "packages/slideclone-native-engine/scripts/component-replacement-apply-plan.js",
  "packages/slideclone-native-engine/scripts/component-replacement-apply-quality-gate.js",
  "packages/slideclone-native-engine/scripts/component-replacement-close-loop.js",
  "packages/slideclone-native-engine/scripts/component-replacement-close-loop-gate.js",
  "packages/slideclone-native-engine/scripts/component-replacement-harvest-queue.js",
  "packages/slideclone-native-engine/scripts/expression-policy-repair-queue-coverage.js",
  "packages/slideclone-native-engine/scripts/component-replacement-harvest-refresh.js",
  "packages/slideclone-native-engine/scripts/component-replacement-plan-report.js",
  "packages/slideclone-native-engine/scripts/component-replacement-sample-gap-report.js",
  "packages/slideclone-native-engine/scripts/real-pptx-quality-matrix.js",
  "packages/slideclone-native-engine/scripts/real-pptx-corpus-runner.js",
  "packages/slideclone-native-engine/scripts/real-pptx-editable-batch.js",
  "packages/slideclone-native-engine/scripts/real-pptx-normalize-smoke.js",
  "packages/slideclone-native-engine/scripts/rebuild-real-pptx-native-parallel.js",
  "packages/slideclone-native-engine/scripts/rendered-preview-audit.js",
  "packages/slideclone-native-engine/scripts/structural-native-audit.js",
  "packages/slideclone-native-engine/scripts/watch-plugin-component-downloads.js",
  "packages/slideclone-native-engine/scripts/quality-gate-ocr-batch.js",
  "packages/slideclone-native-engine/scripts/quality-gate-real-pptx.js",
  "packages/slideclone-native-engine/scripts/quality-trend-gate.js",
  "packages/slideclone-native-engine/scripts/adapters/render-libreoffice.js",
  "packages/slideclone-native-engine/scripts/lib/png.js",
  "packages/slideclone-native-engine/scripts/lib/config-validation.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-cli-runner.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-asset-os-flow.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-asset-os-kpi-benefit.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-document-version.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-entropy-challenge.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-funnel-hub-residual.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-foundation-capability-network.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-grid-color-helpers.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-table-zone-grid-background.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-table-zone-semantic-text.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-table-zone-visual-shell.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-input-output-split.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-kpi-evidence-text.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-options.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-portal-platform.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-product-brain-vision.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-product-collaboration-challenge.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-prototype-loop-assets.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-quadrant-dividers.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-pptx-build-executor.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-scale-landing-evidence.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-skill-chain-overview.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-strategy-profile.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-stacked-architecture.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-sticky-sketch-residual.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-diagram.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-layout.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-primitives.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-source-detection.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-value-banner.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-value-quadrant.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-temporary-answer-workflow-matrix.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-visible-text.js",
  "packages/slideclone-native-engine/scripts/lib/native-rebuild-workdir.js",
  "packages/slideclone-native-engine/scripts/lib/page-background-fill-sampler.js",
  "packages/slideclone-native-engine/scripts/lib/component-plugin-action-queue-cli.js",
  "packages/slideclone-native-engine/scripts/lib/component-strategy-cli.js",
  "packages/slideclone-native-engine/scripts/lib/component-strategy-replacement-plans.js",
  "packages/slideclone-native-engine/scripts/lib/slideclone-default-config.js",
  "packages/slideclone-native-engine/scripts/lib/slideclone-delivery-summary.js",
  "packages/slideclone-native-engine/scripts/lib/quality-gate-output.js",
  "packages/slideclone-native-engine/scripts/lib/quality-gate-render-cache.js",
  "packages/slideclone-native-engine/scripts/lib/quality-gate-editability-profile.js",
  "packages/slideclone-native-engine/scripts/lib/quality-gate-policy.js",
  "packages/slideclone-native-engine/scripts/lib/quality-evidence-cache.js",
  "packages/slideclone-native-engine/scripts/lib/quality-trend.js",
  "packages/slideclone-native-engine/scripts/lib/arc-line-end-ooxml.js",
  "packages/slideclone-native-engine/scripts/lib/ooxml-package-fingerprint.js",
  "packages/slideclone-native-engine/scripts/lib/component-asset-ooxml.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-applied-layout-replay.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-chart-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-cycle-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-family-evidence.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-geometry.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-hub-tree-timeline-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-layered-stack-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-learned-replay-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-matrix-quadrant-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-motifs.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-output-projection.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-palette.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-process-shapes.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-remote-candidate.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-sanitizers.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-structure-fit.js",
  "packages/slideclone-native-engine/scripts/lib/component-template-visual-graph.js",
  "packages/slideclone-native-engine/scripts/adapters/compare-placeholder.js",
  "packages/slideclone-native-engine/scripts/adapters/diff-pixel-png.js",
  "packages/slideclone-native-engine/scripts/adapters/vision-flow-diagram-rules.js",
  "packages/slideclone-native-engine/scripts/adapters/vision-editable-overlay.js",
  legacySkillScript("lib/final-page-cache.js"),
  "scripts/lib/office-node*.js",
  legacySkillScript("lib/graphic-crop-materializer.js"),
  "packages/slideclone-native-engine/scripts/lib/powerpoint-roundtrip-evidence.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-open-evidence.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-session-client.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-session-broker.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-corpus-session.js",
  "packages/slideclone-native-engine/scripts/adapters/validate-powerpoint-editable-roundtrip.js",
  "packages/slideclone-native-engine/scripts/lib/progress-reporter.js",
  "packages/slideclone-native-engine/scripts/adapters/validate-powerpoint-com.js"
];
const postNodeScripts = [
  "scripts/check-common-tools.js",
  "scripts/verify-slideclone-profiles.js",
  "scripts/verify-architecture-budgets.js",
  "scripts/native-engine-runtime-payload.js",
  "scripts/verify-workspace-boundaries.js",
  "scripts/verify-skill-source-migration.js",
  "scripts/verify-skill-lib-wrappers.js"
];

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function runEslintInChunks() {
  const chunkSize = 20;
  const eslintBin = path.join(path.dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
  for (let index = 0; index < eslintTargets.length; index += chunkSize) {
    const chunk = eslintTargets.slice(index, index + chunkSize);
    run(process.execPath, [eslintBin, ...eslintFixedArgs, ...chunk]);
  }
}

function main() {
  runEslintInChunks();
  for (const script of postNodeScripts) {
    run(process.execPath, [script]);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  eslintFixedArgs,
  eslintTargets,
  postNodeScripts,
  runEslintInChunks
};
