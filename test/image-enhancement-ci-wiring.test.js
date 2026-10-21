"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");
const { discoverTestFiles } = require("../scripts/test-sharded");

const repositoryRoot = path.resolve(__dirname, "..");
const enhancementTests = [
  "source-arrow-body.test.js",
  "residual-mask-alpha-policy.test.js",
  "source-ink-core-consensus.test.js",
  "source-paint-coverage.test.js",
  "source-word-layout-evidence.test.js",
  "source-word-layout-registry.test.js",
  "source-word-layout-pipeline.test.js",
  "source-word-typographic-geometry.test.js",
  "source-scene-coordinate-frame.test.js",
  "source-scene-outline.test.js",
  "source-scene-outline-diagnostics.test.js",
  "native-background-parts.test.js",
  "residual-freeform-mask.test.js",
  "source-scene-plan.test.js",
  "source-scene-object-owners.test.js",
  "source-scene-compiler.test.js",
  "source-scene-topology-review.test.js",
  "source-scene-topology-planner.test.js",
  "source-scene-physical-inventory.test.js",
  "source-scene-regional-inventory.test.js",
  "source-scene-crop-sheet.test.js",
  "source-scene-crop-layout.test.js",
  "source-scene-review-allocation.test.js",
  "source-scene-review-targets.test.js",
  "source-scene-fill-window.test.js",
  "source-scene-glyph-occlusion.test.js",
  "source-scene-icon-ownership.test.js",
  "source-closed-ring.test.js",
  "source-scene-measurement-cache.test.js",
  "source-scene-fill-raster-cache.test.js",
  "source-scene-reviewed-graphics.test.js",
  "source-text-band-evidence.test.js",
  "visual-atom-interior-fill.test.js",
  "source-scene-review.test.js",
  "source-scene-planner.test.js",
  "source-scene-missing-text.test.js",
  "source-scene-local-response.test.js",
  "source-scene-client.test.js",
  "diagram-relation-hypotheses.test.js",
  "dla-layout-adapter.test.js",
  "candidate-observation-feedback.test.js",
  "source-connector-crop-contour.test.js",
  "mixed-diagram-panel-evidence.test.js",
  "residual-background-ownership.test.js",
  "residual-text-mask.test.js",
  "residual-ink-components.test.js",
  "residual-text-plan-composition.test.js",
  "relationship-timeline-fallback.test.js",
  "residual-pixel-ownership.test.js",
  "candidate-decision-journal.test.js",
  "missing-candidate-rollback.test.js",
  "native-only-missing-refinement.test.js",
  "candidate-pair-executor.test.js",
  "native-rebuild-candidate-policy.test.js",
  "source-icon-primitive-evidence.test.js",
  "leading-icon-crop-evidence.test.js",
  "leading-icon-crop-materializer.test.js",
  "line-text-panel-boundary.test.js"
];

test("image enhancement regressions are discovered by unit and all test entrypoints", () => {
  for (const suite of ["unit", "all"]) {
    const discovered = new Set(discoverTestFiles(repositoryRoot, suite).map(({ file }) => path.basename(file)));
    assert.deepEqual(enhancementTests.filter((file) => !discovered.has(file)), [], `${suite} suite is missing image enhancement tests`);
  }
});

test("OCR geometry regressions run in both the OCR integration shard and complete CI", () => {
  for(const suite of ["integration","all"]){
    const discovered=new Set(discoverTestFiles(repositoryRoot,suite).map(({file})=>path.basename(file)));
    for (const file of ["ocr-result-admission.test.js", "ocr-geometry-consensus.test.js", "ocr-segment-source-geometry.test.js", "ocr-source-graphic-evidence.test.js", "ocr-source-icon-evidence.test.js"]) {
      assert.equal(discovered.has(file), true, `${suite} is missing ${file}`);
    }
  }
});

test("image enhancement helpers ship in the editable image runtime manifest", () => {
  for (const file of [
    "packages/slideclone-core/residual-mask-alpha-policy.js",
    "packages/slideclone-core/source-scene-plan.js",
    "packages/slideclone-core/source-scene-coordinate-frame.js",
    "packages/slideclone-core/source-scene-outline.js",
    "packages/slideclone-core/source-ink-core-consensus.js",
    "packages/slideclone-core/source-paint-coverage.js",
    "packages/slideclone-core/residual-freeform-mask.js",
    "packages/slideclone-core/source-scene-crop-sheet.js",
    "packages/slideclone-core/source-scene-crop-layout.js",
    "packages/slideclone-core/source-scene-review-allocation.js",
    "packages/slideclone-core/source-scene-review-targets.js",
    "packages/slideclone-core/source-scene-compiler.js",
    "packages/slideclone-core/source-scene-container.js",
    "packages/slideclone-core/source-scene-icon.js",
    "packages/slideclone-core/residual-background-mask.js",
    "packages/slideclone-core/residual-text-mask.js",
    "packages/slideclone-core/residual-ink-components.js",
    "packages/slideclone-core/residual-text-erasure.js",
    "packages/slideclone-core/residual-source-text-evidence.js",
    "packages/slideclone-core/solid-region-evidence.js",
    "packages/slideclone-core/source-panel-layout-evidence.js",
    "packages/slideclone-core/residual-pixel-ownership.js",
    "packages/slideclone-core/source-connector-crop-contour.js",
    "packages/slideclone-core/source-native-finalization.js",
    "packages/slideclone-core/native-rebuild-candidate-policy.js",
    "packages/slideclone-worker-adapter/candidate-decision-journal.js",
    "packages/slideclone-worker-adapter/missing-candidate-rollback.js",
    "packages/slideclone-worker-adapter/native-only-missing-refinement.js",
    "packages/slideclone-worker-adapter/native-only-refinement.js",
    "packages/slideclone-core/source-icon-primitive-evidence.js",
    "packages/slideclone-core/leading-icon-crop-evidence.js",
    "packages/slideclone-core/leading-icon-crop-materializer.js",
    "packages/slideclone-core/line-text-native-analysis.js",
    "packages/slideclone-core/line-text-native-components.js"
  ]) {
    assert.equal(IMAGE_EDITABLE_RELEASE_FILES.includes(file), true, file);
  }
});
