#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runRuntimeCommand: run, runRuntimeProbe } = require("./lib/runtime-command-result");
const { verifyRuntimeDependencyClosure } = require("./lib/runtime-dependency-closure");
const { sceneWorkerConsumerProbe } = require("./lib/runtime-worker-consumer");
const { sceneProgramConsumerProbe } = require("./lib/runtime-program-consumer");
const { sceneSharedRouteConsumerProbe } = require("./lib/runtime-shared-route-consumer");
const { approvedBackdropConsumerProbe } = require("./lib/runtime-backdrop-consumer");
const { runtimePackageFileSpec } = require("./lib/runtime-package-file-spec");

const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024;
const IMAGE_EDITABLE_RELEASE_FILES = Object.freeze([
  "packages/cli/image-reconstruction-policy.js",
  "packages/slideclone-core/quality/native-output-policy.js",
  "packages/slideclone-core/scene-plan/output-edit-groups.js",
  "packages/slideclone-core/scene-plan/semantic-node-edit-groups.js",
  "packages/slideclone-core/routing/source-native-route-finalization.js",
  "packages/slideclone-core/routing/source-filled-route-native.js",
  "packages/slideclone-core/routing/source-native-route-receipts.js",
  "packages/slideclone-core/scene-plan/source-native-route-materialization.js",
  "packages/slideclone-core/routing/source-native-network-registry.js",
  "packages/slideclone-core/routing/whole-route-network-paths.js",
  "packages/slideclone-core/routing/whole-route-network-contract.js",
  "packages/slideclone-core/routing/whole-route-network-fit.js",
  "packages/slideclone-core/routing/whole-route-network-reflow.js",
  "packages/slideclone-core/routing/native-network-page-reflow.js",
  "packages/slideclone-core/routing/native-network-edit-model.js",
  "packages/slideclone-core/routing/whole-route-native-connector.js",
  "packages/slideclone-core/routing/whole-route-network-topology.js",
  "packages/slideclone-core/scene-plan/source-corner-fragment-direction.js",
  "packages/slideclone-core/scene-plan/source-frame-local-ridge.js",
  "packages/slideclone-core/scene-plan/source-dot-row.js",
  "packages/slideclone-core/scene-plan/source-local-glyph.js",
  "packages/slideclone-core/scene-plan/source-glyph-recovery.js",
  "packages/slideclone-core/scene-plan/source-glyph-native-icon.js",
  "packages/slideclone-core/scene-plan/approved-route-materialization.js",
  "packages/slideclone-core/scene-plan/source-scene-frame-diagnostics.js",
  "packages/slideclone-core/scene-plan/approved-backdrop-budget.js",
  "packages/slideclone-core/scene-plan/approved-backdrop-pixel-input.js",
  "packages/slideclone-core/scene-plan/approved-backdrop-pixel-patch.js",
  "packages/slideclone-core/scene-plan/approved-backdrop-pixel-application.js",
  "packages/slideclone-core/scene-plan/approved-backdrop-pixel-replay.js",
  "packages/slideclone-core/typography/source-word-ink-components.js",
  "packages/slideclone-core/typography/source-word-retry-frame.js",
  "packages/slideclone-core/typography/source-word-window-retry.js",
  "packages/slideclone-core/routing/source-route-background-patches.js",
  "packages/slideclone-core/routing/source-route-background-fields.js",
  "packages/slideclone-core/routing/source-route-background-ranges.js",
  "packages/slideclone-core/routing/source-route-background-search.js",
  "packages/slideclone-core/routing/source-route-background-conflicts.js",
  "packages/slideclone-core/routing/source-route-background-corners.js",
  "packages/slideclone-core/routing/source-route-shaft-continuity.js",
  "packages/slideclone-core/routing/source-route-section-witnesses.js",
  "packages/slideclone-core/routing/source-route-wide-fringe.js",
  "packages/slideclone-core/scene-plan/approved-frame-reconstruction.js",
  "packages/slideclone-core/scene-plan/approved-frame-erasure-replay.js",
  "packages/slideclone-core/scene-plan/approved-card-backdrop-input.js",
  "packages/slideclone-core/scene-plan/approved-card-backdrop.js",
  "packages/slideclone-core/scene-plan/approved-frame-fit.js",
  "packages/slideclone-core/scene-plan/approved-frame-draw.js",
  "packages/slideclone-core/scene-plan/approved-frame-mask.js",
  "packages/slideclone-core/scene-plan/approved-frame-background.js",
  "packages/slideclone-core/scene-plan/approved-frame-approximation.js",
  "packages/slideclone-core/scene-plan/approved-frame-bytes.js",
  "packages/slideclone-core/scene-plan/approved-frame-bounds.js",
  "packages/slideclone-core/scene-plan/approved-frame-application.js",
  "packages/slideclone-core/scene-plan/approved-frame-completion.js",
  "packages/slideclone-core/scene-plan/approved-frame-application-input.js",
  "packages/slideclone-core/scene-plan/approved-frame-application-files.js",
  "packages/slideclone-core/scene-plan/approved-frame-application-lifecycle.js",
  "packages/slideclone-core/scene-plan/residual-connector-path.js",
  "packages/slideclone-core/scene-plan/residual-connector-mask.js",
  "packages/slideclone-core/native-rebuild-ocr-stage.js",
  "packages/slideclone-core/native-rebuild-residual-stage.js",
  "packages/slideclone-core/native-rebuild-scene-stage.js",
  "packages/slideclone-core/routing/source-route-corner-mode.js",
  "packages/slideclone-core/routing/source-route-polyline.js",
  "packages/slideclone-core/routing/source-route-linear-sections.js",
  "packages/slideclone-core/routing/source-route-output-groups.js",
  "packages/slideclone-core/routing/source-route-native-gradient.js",
  "packages/slideclone-core/routing/source-route-native-elbow.js",
  "packages/slideclone-core/routing/source-route-shared-axes.js",
  "packages/slideclone-core/routing/source-route-native-chain-input.js",
  "packages/slideclone-core/routing/source-route-native-chain.js",
  "packages/slideclone-core/routing/source-route-banded-smoothing.js",
  "packages/slideclone-core/routing/source-route-transverse-targets.js",
  "packages/slideclone-core/routing/source-route-curve-input.js",
  "packages/slideclone-core/routing/source-route-cubic-fit.js",
  "packages/slideclone-core/routing/source-route-curve-geometry.js",
  "packages/slideclone-core/routing/source-route-curve-topology.js",
  "packages/slideclone-core/routing/source-shared-route-curves.js",
  "packages/slideclone-core/routing/source-route-curve-footprint.js",
  "packages/slideclone-core/routing/source-shared-output-footprint.js",
  "packages/slideclone-core/routing/source-shared-curve-footprint.js",
  "packages/slideclone-core/routing/source-shared-route-background.js",
  "packages/slideclone-core/routing/source-shared-route-output.js",
  "packages/slideclone-core/routing/source-shared-whole-routes.js",
  "packages/slideclone-core/routing/source-whole-route-geometry.js",
  "packages/slideclone-core/routing/source-whole-route-paint.js",
  "packages/slideclone-core/routing/source-adaptive-gradient-paint.js",
  "packages/slideclone-core/scene-plan/source-scene-connector-group-scope.js",
  "packages/slideclone-core/scene-plan/source-scene-route-representation.js",
  "packages/slideclone-core/scene-plan/approved-route-approximation-input.js",
  "packages/slideclone-core/scene-plan/approved-route-approximation.js",
  "packages/slideclone-core/routing/source-route-native-topology.js",
  "packages/slideclone-core/routing/source-route-spatial-paint.js",
  "packages/slideclone-core/routing/source-route-paint-fit.js",
  "packages/slideclone-core/routing/source-shared-head-contacts.js",
  "packages/slideclone-core/quality/native-relationship-path.js",
  "packages/slideclone-worker-adapter/worker-relationship-policy.js",
  "packages/slideclone-core/scene-plan/source-scene-routing-stage.js",
  "packages/slideclone-core/scene-plan/source-scene-surface-stage.js",
  "packages/slideclone-worker-adapter/worker-candidate-api.js",
  "packages/slideclone-worker-adapter/worker-graphic-evidence-2.js",
  "packages/slideclone-worker-adapter/worker-graphic-evidence.js",
  "packages/slideclone-worker-adapter/worker-input-services.js",
  "packages/slideclone-worker-adapter/worker-job-runner.js",
  "packages/slideclone-worker-adapter/worker-job-support.js",
  "packages/slideclone-worker-adapter/worker-asset-namespace.js",
  "packages/slideclone-worker-adapter/worker-missing-graphics-2.js",
  "packages/slideclone-worker-adapter/worker-missing-graphics.js",
  "packages/slideclone-worker-adapter/worker-native-candidates.js",
  "packages/slideclone-worker-adapter/worker-native-recovery-2.js",
  "packages/slideclone-worker-adapter/worker-native-recovery.js",
  "packages/slideclone-worker-adapter/worker-output-services.js",
  "packages/slideclone-worker-adapter/worker-primitives-2.js",
  "packages/slideclone-worker-adapter/worker-primitives.js",
  "packages/slideclone-worker-adapter/worker-provenance.js",
  "packages/slideclone-worker-adapter/worker-quality-policy.js",
  "packages/slideclone-worker-adapter/worker-refinement-stages.js",
  "packages/slideclone-worker-adapter/worker-surface-candidates.js",
  "packages/slideclone-worker-adapter/worker-surface-evidence.js",
  "packages/slideclone-worker-adapter/worker-surface-refinement.js",
  "packages/slideclone-worker-adapter/worker-text-candidates.js",
  "packages/slideclone-worker-adapter/worker-text-evidence.js",
  "packages/slideclone-worker-adapter/worker-text-refinement.js",
  "packages/slideclone-worker-adapter/worker-visual-refinement.js",
  "packages/remote-mcp-server/scene-execution-controls.js",
  "packages/remote-mcp-server/scene-provider-endpoint.js",
  "packages/remote-mcp-server/source-scene-runtime.js",
  "packages/remote-mcp-server/source-scene-review-store.js",
  "packages/slideclone-core/scene-plan/retained-scene-review.js",
    "packages/slideclone-core/scene-plan/source-scene-retained-route-rebinding.js",
  "packages/slideclone-core/scene-plan/source-scene-admission-history.js",
  "packages/slideclone-core/scene-plan/source-scene-program-obligations.js",
  "packages/slideclone-core/scene-plan/source-scene-program-contract.js",
  "packages/slideclone-core/scene-plan/source-scene-program-tasks.js",
  "packages/slideclone-core/scene-plan/source-scene-recovery-policy.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-localization.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-localization-review.js",
  "packages/slideclone-core/scene-plan/source-scene-path-review.js",
  "packages/slideclone-core/scene-plan/source-scene-edge-choice-review.js",
  "packages/slideclone-core/scene-plan/source-scene-edge-choice-contract.js",
  "packages/slideclone-core/routing/source-shared-route-choice.js",
  "packages/slideclone-core/scene-plan/source-scene-path-consensus.js",
  "packages/slideclone-core/scene-plan/source-scene-path-distance.js",
  "packages/slideclone-core/scene-plan/source-scene-deferred-relation-review.js",
  "packages/slideclone-core/routing/source-shared-route-path-binding.js",
  "packages/slideclone-core/scene-plan/source-scene-program-generation.js",
  "packages/slideclone-core/scene-plan/source-scene-regional-consensus.js",
  "packages/slideclone-core/scene-plan/source-scene-obligation-coverage.js",
  "packages/slideclone-core/routing/source-visible-dash-profile.js",
  "packages/slideclone-core/routing/source-detached-dash-head.js",
  "packages/slideclone-core/routing/source-dash-spatial-paint.js",
  "packages/slideclone-core/scene-plan/source-visible-gap-residual.js",
  "packages/slideclone-core/scene-plan/source-shared-residual-union.js",
  // The full residual consumes the shared compiler's private proof reader.
  // Require its complete relative closure in standalone Runtime consumers.
  "packages/slideclone-core/archetypes/sparse-icon-native-contours.js",
  "packages/slideclone-core/routing/source-route-centerline.js",
  "packages/slideclone-core/routing/source-route-core-samples.js",
  "packages/slideclone-core/routing/source-shared-junction-arms.js",
  "packages/slideclone-core/routing/source-shared-route-output-groups.js",
  "packages/slideclone-core/scene-plan/native-background-parts.js",
  "packages/slideclone-core/scene-plan/source-closed-cage.js",
  "packages/slideclone-core/scene-plan/source-outline-paint-shapes.js",
  "packages/slideclone-core/scene-plan/source-scene-cage-observation.js",
  "packages/slideclone-core/scene-plan/source-scene-cage-program.js",
  "packages/slideclone-core/scene-plan/source-scene-native-geometry.js",
  "packages/slideclone-core/scene-plan/source-scene-parent-members.js",
  "packages/slideclone-core/scene-plan/source-scene-patterned-output.js",
  "packages/slideclone-core/scene-plan/source-scene-primitive-candidate.js",
  "packages/slideclone-core/scene-plan/source-scene-primitive-paths.js",
  "packages/slideclone-core/scene-plan/source-scene-primitive-program.js",
  "packages/slideclone-core/scene-plan/source-scene-primitive-raster.js",
  "packages/slideclone-core/scene-plan/source-scene-region-program.js",
  "packages/slideclone-core/scene-plan/source-scene-rejected-relations.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-batches.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-identity.js",
  "packages/slideclone-core/scene-plan/source-scene-route.js",
  "packages/slideclone-core/scene-plan/source-scene-visible-gap-compiler.js",
  "packages/slideclone-core/scene-plan/source-label-identity.js",
  "packages/slideclone-core/scene-plan/source-scene-visible-gap.js",
  "packages/slideclone-core/scene-plan/source-scene-ink-port.js",
  "packages/slideclone-core/scene-plan/source-polygon-row-mask.js",
  "packages/slideclone-core/scene-plan/source-scene-patterned-frame.js",
  "packages/slideclone-core/scene-plan/source-scene-fragmented-corner.js",
  "packages/slideclone-core/scene-plan/source-scene-frame-occlusion.js",
  "packages/slideclone-core/scene-plan/source-scene-attached-rail-mark.js",
  "packages/slideclone-core/scene-plan/source-outline-paint.js",
  "packages/slideclone-core/scene-plan/source-outline-palette.js",
  "packages/slideclone-core/scene-plan/native-mask-contours.js",
  "packages/slideclone-core/scene-plan/source-scene-glyph-choice.js",
  "packages/slideclone-core/scene-plan/source-outline-spatial-exterior.js",
  "packages/slideclone-core/scene-plan/source-ring-interior-witness.js",
  "packages/slideclone-core/routing/source-ring-distance.js",
  "packages/slideclone-core/routing/source-filled-arrow-profile.js",
  "packages/slideclone-core/routing/source-filled-arrow-body.js",
  "packages/slideclone-core/routing/source-filled-arrow-slices.js",
  "packages/slideclone-core/scene-plan/source-scene-visible-gap-diagonal.js",
  "packages/slideclone-core/routing/source-arrow-coverage-paint.js",
  "packages/slideclone-core/routing/source-visible-gap-profile.js",
  "packages/slideclone-core/routing/source-visible-arrow-terminals.js",
  "packages/slideclone-core/routing/source-dash-coverage-paint.js",
  "packages/slideclone-core/routing/source-visible-gap-diagonal-profile.js",
  "packages/slideclone-core/routing/source-visible-gap-program.js",
  "packages/slideclone-core/routing/source-visible-gap-background.js",
  "packages/slideclone-core/scene-plan/source-scene-port-axis.js",
  "packages/slideclone-core/scene-plan/source-scene-dash-retirement.js",
  "packages/slideclone-core/scene-plan/source-crop-registration.js",
  "packages/slideclone-core/scene-plan/source-crop-paint-overlap.js",
  "packages/slideclone-core/scene-plan/source-route-retained-context.js",
  "packages/slideclone-core/scene-plan/source-crop-connector-erasure.js",
    "packages/slideclone-core/routing/source-visible-diagonal-dash-profile.js",
    "packages/slideclone-core/routing/source-visible-crossing-dash-profile.js",
    "packages/slideclone-core/routing/source-oblique-dash-profile.js",
    "packages/slideclone-core/routing/source-oblique-dash-footprint.js",
    "packages/slideclone-core/routing/source-crossing-dash-partition.js",
    "packages/slideclone-core/scene-plan/source-icon-part-fringe-owners.js",
    "packages/slideclone-core/routing/source-route-observation-window.js",
    "packages/slideclone-core/routing/source-route-local-background.js",
  "packages/slideclone-core/routing/source-visible-gap-exterior.js",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeSourceDash.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeConnectorGeometry.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeConnectorExtents.cs",
  "packages/slideclone-core/scene-plan/source-scene-text-endpoints.js",
  "packages/slideclone-core/libreoffice-grouped-text-connections.js",
  "packages/slideclone-core/libreoffice-connector-evidence.js",
  "packages/slideclone-core/libreoffice-native-tracks.js",
  "packages/slideclone-core/python/libreoffice_native_plan.py",
  "packages/slideclone-core/python/libreoffice_native_render.py",
  "packages/slideclone-core/libreoffice-gradient-evidence.js",
  "packages/slideclone-core/routing/source-bent-arrow-profile.js",
  "packages/slideclone-core/routing/source-compound-route-geometry.js",
  "packages/slideclone-core/routing/source-compound-route-axis.js",
  "packages/slideclone-core/routing/source-compound-route-partition.js",
  "packages/slideclone-core/routing/source-compound-route-width.js",
  "packages/slideclone-core/routing/source-route-scanline-background.js",
  "packages/slideclone-core/routing/source-route-visible-background.js",
  "packages/slideclone-core/routing/source-route-head-cut.js",
  "packages/slideclone-core/routing/source-route-contour-parts.js",
  "packages/slideclone-core/routing/source-route-shaft-topology.js",
  "packages/slideclone-core/routing/source-filled-route-geometry.js",
  "packages/slideclone-core/routing/source-filled-route-binding.js",
  "packages/slideclone-core/routing/source-filled-route-compiler.js",
  "packages/slideclone-core/routing/source-route-contact-centres.js",
  "packages/slideclone-core/routing/source-filled-head-profile.js",
  "packages/slideclone-core/scene-plan/source-obstacle-probe.js",
  "packages/slideclone-core/scene-plan/source-scene-visible-bent-gap.js",
  "packages/slideclone-core/routing/source-route-paint.js",
  "packages/slideclone-core/routing/source-route-coverage-width.js",
  "packages/slideclone-core/routing/source-route-source-centering.js",
  "packages/slideclone-core/scene-plan/native-opaque-rectangle-mask.js",
  "packages/slideclone-core/scene-plan/source-scene-regional-relation-anchor.js",
  "packages/slideclone-core/scene-plan/source-scene-deferred-regional-review.js",
  "packages/slideclone-core/scene-plan/source-scene-open-owner-transaction.js",
  "packages/slideclone-core/typography/source-text-band-background.js",
  "packages/slideclone-worker-adapter/retained-residual-deduplication.js",
  "packages/slideclone-core/scene-plan/source-scene-inventory-artifact.js",
  "packages/slideclone-core/scene-plan/source-scene-inventory-codec.js",
  "packages/slideclone-core/scene-plan/source-scene-shared-route-inventory.js",
  "packages/slideclone-core/scene-plan/source-scene-route-endpoints.js",
  "packages/slideclone-core/routing/source-shared-shaft-tree.js",
  "packages/slideclone-core/routing/source-shared-route-heads.js",
  "packages/slideclone-core/routing/source-shared-head-branch.js",
  "packages/slideclone-core/routing/source-shared-contact-terminals.js",
  "packages/slideclone-core/routing/source-route-minimum-polyline.js",
  "packages/slideclone-core/routing/source-route-footprint-polyline.js",
  "packages/slideclone-core/routing/source-shared-route-edges.js",
  "packages/slideclone-core/routing/source-route-node-background.js",
  "packages/slideclone-core/routing/source-route-body-shadow-spans.js",
  "packages/slideclone-core/routing/source-shared-route-coverage.js",
  "packages/slideclone-core/routing/source-shared-route-contacts.js",
  "packages/slideclone-core/routing/source-shared-route-component.js",
  "packages/slideclone-core/routing/source-shared-route-gap.js",
  "packages/slideclone-core/routing/source-shared-gap-backdrop.js",
  "packages/slideclone-core/routing/source-shared-route-measurement.js",
  "packages/slideclone-core/routing/source-route-antialias-background.js",
  "packages/slideclone-core/routing/source-route-core-backdrop.js",
  "packages/slideclone-core/routing/source-route-core-halo.js",
  "packages/slideclone-core/routing/source-route-core-pending.js",
  "packages/slideclone-core/routing/source-shared-route-compiler.js",
  "packages/slideclone-core/routing/source-shared-route-bindings.js",
  "packages/slideclone-core/routing/source-shared-route-reprojection.js",
  "packages/slideclone-core/routing/source-shared-route-output-paint.js",
  "packages/slideclone-core/routing/source-shared-route-output-snapshot.js",
  "packages/slideclone-core/scene-plan/source-scene-shared-route-stage.js",
  "packages/slideclone-core/scene-plan/source-scene-open-owner-inventory.js",
  "packages/slideclone-core/scene-plan/source-scene-open-owner-members.js",
  "packages/slideclone-core/scene-plan/source-scene-open-paint.js",
  "packages/slideclone-core/scene-plan/source-scene-literal-paint.js",
  "packages/slideclone-core/ocr/ocr-source-arrow-evidence.js",
  "packages/slideclone-core/typography/typography-contract.js",
  "packages/slideclone-core/typography/paragraph-typography.js",
    "packages/slideclone-core/typography/paragraph-source-frame.js",
  "packages/slideclone-core/typography/paragraph-layout.js",
  "packages/slideclone-core/typography/paragraph-container-layout.js",
  "packages/slideclone-core/typography/paragraph-render-feedback.js",
  "packages/slideclone-core/quality/typography-quality.js",
  "packages/slideclone-core/archetypes/reconstruction-search-control.js",
  "packages/slideclone-core/typography/rendered-typography-audit.js",
  "packages/slideclone-worker-adapter/typography-reconstruction.js",
  "packages/slideclone-worker-adapter/legacy-text-search.js",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeParagraphText.cs",
  "packages/slideclone-core/scene-plan/source-scene-paired-review.js",
  "packages/slideclone-core/scene-plan/source-scene-local-observations.js",
  "packages/slideclone-core/scene-plan/source-scene-ocr-batches.js",
  "packages/slideclone-core/scene-plan/source-scene-local-review.js",
  "packages/slideclone-core/scene-plan/source-scene-plan.js",
  "packages/slideclone-core/scene-plan/source-scene-surface-paths.js",
  "packages/slideclone-core/scene-plan/source-scene-label-layout.js",
  "packages/slideclone-core/scene-plan/source-scene-compact-program.js",
  "packages/slideclone-core/scene-plan/source-scene-packed-program.js",
  "packages/slideclone-core/scene-plan/source-scene-global-locations.js",
  "packages/slideclone-core/scene-plan/source-scene-graphic-locations.js",
  "packages/slideclone-core/scene-plan/source-scene-visual-candidates.js",
  "packages/slideclone-core/scene-plan/source-scene-candidate-selection.js",
  "packages/slideclone-core/scene-plan/source-scene-candidate-classification.js",
  "packages/slideclone-core/scene-plan/source-scene-stroke-graph.js",
  "packages/slideclone-core/scene-plan/source-scene-stroke-binding.js",
  "packages/slideclone-core/scene-plan/source-scene-residual-candidates.js",
  "packages/slideclone-core/scene-plan/source-scene-regional-unit.js",
  "packages/slideclone-core/scene-plan/source-scene-packed-program-prompt.js",
  "packages/slideclone-core/scene-plan/source-scene-program-prompt.js",
  "packages/slideclone-core/scene-plan/source-scene-ocr-hints.js",
  "packages/slideclone-core/typography/source-ring-text-ownership.js",
  "packages/slideclone-core/scene-plan/source-scene-object-batches.js",
  "packages/slideclone-core/scene-plan/source-scene-path-program.js",
  "packages/slideclone-core/scene-plan/source-scene-observed-inventory.js",
    "packages/slideclone-core/scene-plan/source-scene-inventory-materialization.js",
  "packages/slideclone-core/scene-plan/source-scene-interior-row-targets.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-fallbacks.js",
  "packages/slideclone-core/scene-plan/source-scene-object-owners.js",
  "packages/slideclone-core/typography/source-text-separator.js",
  "packages/slideclone-core/scene-plan/source-scene-fill-window.js",
  "packages/slideclone-core/scene-plan/source-fill-gradient.js",
  "packages/slideclone-core/scene-plan/source-gradient-ellipse.js",
  "packages/slideclone-core/scene-plan/source-surface-gradient.js",
  "packages/slideclone-core/scene-plan/native-layer-change-input.js",
  "packages/slideclone-core/scene-plan/native-layer-change-style.js",
  "packages/slideclone-core/scene-plan/native-layer-change-plan.js",
  "packages/slideclone-core/scene-plan/native-layer-binding.js",
  "packages/slideclone-core/scene-plan/native-layer-application.js",
  "packages/slideclone-core/scene-plan/source-measured-fill-compatibility.js",
  "packages/slideclone-core/scene-plan/source-measured-outline-compatibility.js",
  "packages/slideclone-core/scene-plan/approved-frame-retirement-selection.js",
  "packages/slideclone-core/scene-plan/approved-card-text-ancestors.js",
  "packages/slideclone-core/typography/source-measured-text-compatibility.js",
  "packages/slideclone-core/scene-plan/source-scene-fill-geometry.js",
  "packages/slideclone-core/scene-plan/source-scene-fill-geometry-batch.js",
  "packages/slideclone-core/scene-plan/source-scene-fill-geometry-worker.js",
  "packages/slideclone-core/scene-plan/source-scene-band-geometry.js",
  "packages/slideclone-core/scene-plan/source-scene-layered-background.js",
  "packages/slideclone-core/routing/native-contour-shortest-path.js",
  "packages/slideclone-core/routing/native-contour-certified-curves.js",
  "packages/slideclone-core/routing/source-shaft-profile.js",
  "packages/slideclone-core/routing/source-arrow-body.js",
  "packages/slideclone-core/routing/source-complete-arrow-head.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-recovery.js",
  "packages/slideclone-core/scene-plan/source-scene-topology-review.js",
  "packages/slideclone-core/scene-plan/source-scene-endpoint-scope.js",
  "packages/slideclone-core/scene-plan/source-scene-relation-scope-review.js",
  "packages/slideclone-core/scene-plan/source-scene-census-scope-review.js",
  "packages/slideclone-core/scene-plan/source-scene-census-discovery-history.js",
  "packages/slideclone-core/scene-plan/source-scene-retained-discovery.js",
  "packages/slideclone-core/scene-plan/source-scene-regional-review.js",
  "packages/slideclone-core/scene-plan/source-scene-port-evidence.js",
  "packages/slideclone-core/scene-plan/source-scene-group-containment.js",
  "packages/slideclone-core/scene-plan/source-inventory-revision-snapshot.js",
  "packages/slideclone-core/scene-plan/source-inventory-revision.js",
  "packages/slideclone-core/scene-plan/source-inventory-revision-output.js",
  "packages/slideclone-core/scene-plan/source-scene-physical-groups.js",
  "packages/slideclone-core/scene-plan/source-scene-background-members.js",
  "packages/slideclone-core/scene-plan/source-scene-background-owner.js",
  "packages/slideclone-core/scene-plan/source-scene-complete-groups.js",
  "packages/slideclone-core/scene-plan/source-scene-group-owner.js",
  "packages/slideclone-core/scene-plan/source-scene-group-paint.js",
  "packages/slideclone-core/scene-plan/source-scene-group-retention.js",
  "packages/slideclone-core/scene-plan/source-scene-group-snapshot.js",
  "packages/slideclone-core/scene-plan/source-scene-native-icon-groups.js",
  "packages/slideclone-core/scene-plan/native-filled-path-overlap.js",
  "packages/slideclone-core/scene-plan/native-group-paint-bounds.js",
  "packages/slideclone-core/scene-plan/source-route-backdrop-field.js",
  "packages/slideclone-core/scene-plan/source-scene-icon-ownership.js",
  "packages/slideclone-core/scene-plan/source-scene-inventory-review.js",
  "packages/slideclone-core/scene-plan/source-scene-native-icon.js",
  "packages/slideclone-core/typography/source-tabular-text-layout.js",
  "packages/slideclone-core/scene-plan/source-closed-ring.js",
  "packages/slideclone-core/scene-plan/source-outline-color.js",
  "packages/slideclone-core/scene-plan/source-ink-core-consensus.js",
  "packages/slideclone-core/scene-plan/source-paint-coverage.js",
  "packages/slideclone-core/scene-plan/source-scene-measurement-cache.js",
  "packages/slideclone-core/scene-plan/source-scene-fill-raster-cache.js",
  "packages/slideclone-core/scene-plan/source-scene-reviewed-graphics.js",
  "packages/slideclone-core/scene-plan/source-scene-compiler.js",
  "packages/slideclone-core/scene-plan/source-scene-text-frame.js",
  "packages/slideclone-core/scene-plan/source-scene-compilation-session.js",
  "packages/slideclone-core/scene-plan/source-scene-compile-feedback.js",
  "packages/slideclone-core/scene-plan/source-scene-region-boundary-review.js",
  "packages/slideclone-core/scene-plan/source-scene-container.js",
  "packages/slideclone-core/scene-plan/source-scene-icon.js",
  "packages/slideclone-core/scene-plan/source-pictorial-crop-admission.js",
  "packages/slideclone-core/scene-plan/visual-atom-ocr-conflict.js",
  "packages/slideclone-core/scene-plan/source-scene-relation.js",
  "packages/slideclone-core/scene-plan/source-scene-crop-sheet.js",
  "packages/slideclone-core/scene-plan/source-scene-crop-layout.js",
  "packages/slideclone-core/scene-plan/source-scene-review-allocation.js",
  "packages/slideclone-core/scene-plan/source-scene-review-targets.js",
  "packages/slideclone-core/scene-plan/source-scene-coordinate-frame.js",
    "packages/slideclone-core/scene-plan/source-scene-outline.js",
    "packages/slideclone-core/scene-plan/source-outline-axis-retirement.js",
    "packages/slideclone-core/scene-plan/residual-freeform-mask.js",
    "packages/slideclone-core/scene-plan/residual-ellipse-mask.js",
    "packages/slideclone-core/scene-plan/residual-preserved-path.js",
  "packages/slideclone-core/ocr/ocr-geometry-consensus.js",
  "packages/slideclone-core/scene-plan/visual-atom-interior-fill.js",
  "packages/slideclone-core/ocr/ocr-light-ink-color.js",
  "packages/remote-mcp-server/image-native-rebuilder.js",
  "packages/remote-mcp-server/source-scene-client.js",
  "packages/remote-mcp-server/scene-response-content.js",
  "packages/remote-mcp-server/scene-execution-policy.js",
  "packages/remote-mcp-server/scene-model-request-options.js",
  "packages/slideclone-core/scene-plan/source-scene-planner.js",
  "packages/slideclone-core/scene-plan/source-scene-missing-text.js",
  "packages/slideclone-core/scene-plan/source-scene-local-response.js",
  "packages/slideclone-core/scene-plan/source-scene-structural-review.js",
  "packages/slideclone-core/routing/residual-bezier-crossings.js",
  "packages/slideclone-core/scene-plan/native-freeform-path.js",
  "packages/slideclone-core/scene-plan/source-scene-glyph-occlusion.js",
  "packages/slideclone-core/routing/source-stroke-distance.js",
  "packages/slideclone-core/scene-plan/native-opacity-defaults.js",
  "packages/slideclone-core/typography/native-text-inset-defaults.js",
  "packages/slideclone-core/typography/native-text-evidence-defaults.js",
  "packages/slideclone-core/typography/native-text-outline.js",
  "packages/slideclone-core/scene-plan/native-shadow-scale.js",
  "packages/slideclone-core/typography/positioned-text-font-override.js",
  "packages/slideclone-core/scene-plan/source-ring-fill-containment.js",
  "packages/slideclone-core/scene-plan/source-scene-review.js",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/ConnectorAttachmentWriter.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/PositionedTextConnectionTarget.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeFreeformPath.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeShadowScale.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeGlow.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeLineDash.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeLineCap.cs",
  "packages/slideclone-core/scene-plan/residual-pixel-ownership.js",
  "packages/slideclone-core/scene-plan/residual-background-mask.js",
  "packages/slideclone-core/quality/residual-mask-alpha-policy.js",
  "packages/slideclone-core/typography/residual-text-mask.js",
  "packages/slideclone-core/scene-plan/residual-ink-components.js",
  "packages/remote-mcp-server/image-semantic-admission.js",
  "packages/slideclone-core/typography/residual-text-erasure.js",
  "packages/slideclone-core/scene-plan/residual-native-fill-background.js",
  "packages/slideclone-core/typography/residual-source-text-evidence.js",
  "packages/slideclone-core/scene-plan/solid-region-evidence.js",
  "packages/slideclone-core/scene-plan/source-panel-layout-evidence.js",
  "packages/slideclone-core/quality/native-rebuild-candidate-policy.js",
  "packages/slideclone-worker-adapter/candidate-decision-journal.js",
  "packages/slideclone-core/archetypes/asset-closure-funnel.js",
  "packages/slideclone-core/cli-scaffold-generator.js",
  "packages/slideclone-core/archetypes/component-rebuild-precedence.js",
  "packages/slideclone-core/archetypes/component-template-group-matcher.js",
  "packages/slideclone-core/archetypes/component-template-style.js",
  "packages/slideclone-core/routing/connector-component-library.js",
  "packages/slideclone-core/archetypes/dense-radial-network-policy.js",
  "packages/slideclone-core/archetypes/dense-topology-line-compactor.js",
  "packages/slideclone-core/archetypes/embedded-expert-screenshot.js",
  "packages/slideclone-core/archetypes/fidelity-crop-materializer.js",
  "packages/slideclone-core/archetypes/fragmented-asset-chain.js",
  "packages/slideclone-core/archetypes/network-rebuild-orchestrator.js",
  "packages/slideclone-core/ocr/ocr-grid-table.js",
  "packages/slideclone-core/routing/orthogonal-connector-promotion.js",
  "packages/slideclone-core/archetypes/paradigm-shift-matrix.js",
  "packages/slideclone-core/pptx-inventory.js",
  "packages/ooxml-core/pptx-inventory.js",
  "packages/slideclone-core/archetypes/prd-segmented-flow-components.js",
  "packages/slideclone-core/archetypes/product-collaboration-protection.js",
  "packages/slideclone-core/archetypes/product-manager-friction-network.js",
  "packages/slideclone-core/archetypes/prototype-generation-loop.js",
  "packages/slideclone-core/archetypes/prototype-loop-measurement.js",
  "packages/slideclone-core/quality/prototype-validation-screenshot-policy.js",
  "packages/slideclone-core/archetypes/radial-network-detector.js",
  "packages/slideclone-core/quality/residual-overlap-policy.js",
  "packages/slideclone-core/scene-plan/residual-ownership.js",
  "packages/slideclone-core/archetypes/runtime-engine-hybrid.js",
  "packages/slideclone-core/archetypes/smart-review-hybrid.js",
  "packages/slideclone-core/archetypes/stacked-layer-color-sampling.js",
  "packages/slideclone-core/archetypes/system-map-pixel-evidence.js",
  "packages/slideclone-core/archetypes/system-map-reconstruction.js",
  "packages/slideclone-core/archetypes/system-map-semantics.js",
  "packages/slideclone-core/typography/text-anchored-process-network.js",
  "packages/slideclone-core/typography/text-box-micro-adjust.js",
  "packages/slideclone-core/archetypes/triangle-topology-measurement.js",
  "packages/slideclone-core/archetypes/value-transformation-table.js",
  "packages/slideclone-core/typography/visual-feature-context.js",
  "packages/slideclone-core/archetypes/visual-operation-sync.js",
  "packages/slideclone-core/archetypes/workflow-collaboration-multiplier-scope.js",
  "packages/slideclone-core/archetypes/cover-graphic-rules.js",
  "packages/slideclone-core/archetypes/registry-graphic-rules.js",
  "packages/slideclone-core/scene-plan/graphic-crop-materializer.js",
  "packages/slideclone-core/typography/workflow-cover-text.js",
  "packages/slideclone-core/python/inpaint-decorative-background.py",
  "packages/slideclone-core/decorative-cover-graphics.js",
  "packages/slideclone-core/scene-plan/graphic-crop-analysis.js",
  "packages/slideclone-core/scene-plan/graphic-crop-generation.js",
  "packages/slideclone-core/archetypes/entropy-challenge-crops.js",
  "packages/slideclone-core/scene-plan/graphic-underlay-crops.js",
  "packages/slideclone-core/archetypes/kpi-title-graphics.js",
  "packages/slideclone-core/typography/line-text-native-components.js",
  "packages/slideclone-core/typography/line-text-native-analysis.js",
  "packages/slideclone-core/typography/line-text-native-primitives.js",
  "packages/slideclone-core/typography/source-text-band-evidence.js",
  "packages/slideclone-core/typography/color-panel-text-ownership.js",
  "packages/slideclone-core/ocr/ocr-status-native-components.js",
  "packages/slideclone-core/scene-plan/page-output-rules.js",
  "packages/slideclone-core/typography/font-evidence.js",
  "packages/slideclone-core/typography/page-text-rule-helpers.js",
  "packages/slideclone-core/typography/page-text-rules.js",
  "packages/slideclone-core/typography/comparison-matrix-text.js",
  "packages/slideclone-core/archetypes/comparison-matrix-layout.js",
  "packages/slideclone-core/archetypes/structured-case-matrix-reconstruction.js",
  "packages/slideclone-core/archetypes/comparison-matrix-reconstruction.js",
  "packages/slideclone-core/archetypes/structured-card-visual-reconstruction.js",
  "packages/slideclone-core/archetypes/relationship-native-shell.js",
  "packages/slideclone-core/archetypes/relationship-native-layouts.js",
  "packages/slideclone-core/archetypes/relationship-native-shapes.js",
  "packages/slideclone-core/archetypes/relationship-native-geometry.js",
  "packages/slideclone-core/archetypes/relationship-topology-helpers.js",
  "packages/slideclone-core/archetypes/relationship-branch-card-shell.js",
  "packages/slideclone-core/archetypes/relationship-basic-shells.js",
  "packages/slideclone-core/archetypes/relationship-funnel-lens-shell.js",
  "packages/slideclone-core/archetypes/relationship-hub-spoke-shell.js",
  "packages/slideclone-core/archetypes/relationship-layered-flow-shells.js",
  "packages/slideclone-core/archetypes/relationship-sankey-shell.js",
  "packages/slideclone-core/scene-plan/visual-atom-native-reconstruction.js",
  "packages/slideclone-core/archetypes/pixel-branch-curve-detector.js",
  "packages/slideclone-core/archetypes/component-strategy-annotator.js",
  "packages/slideclone-core/scene-plan/visual-atom-topology.js",
  "packages/slideclone-core/scene-plan/visual-atom-native-shapes.js",
  "packages/slideclone-core/scene-plan/visual-atom-fallback.js",
  "packages/slideclone-core/scene-plan/visual-atom-native-metadata.js",
  "packages/slideclone-core/archetypes/gantt-native-shell.js",
  "packages/slideclone-core/scene-plan/visual-atom-promotion.js",
  "packages/slideclone-core/quality/visual-atom-native-policy.js",
  "packages/slideclone-core/scene-plan/visual-atom-component-grouping.js",
  "packages/slideclone-core/archetypes/asset-hub-cycle-reconstruction.js",
  "packages/slideclone-core/archetypes/asset-os-closed-loop-reconstruction.js",
  "packages/slideclone-core/archetypes/comparison-matrix-evidence.js",
  "packages/slideclone-core/archetypes/closed-loop-hybrid.js",
  "packages/slideclone-core/typography/text-mask-cleanup.js",
  "packages/slideclone-core/archetypes/four-step-landing-reconstruction.js",
  "packages/slideclone-core/archetypes/diagram-label-matching.js",
  "packages/slideclone-core/archetypes/wms-route-reconstruction.js",
  "packages/slideclone-core/routing/workflow-wms-route-chain-scope.js",
  "packages/slideclone-core/scene-plan/detection-result.js",
  "packages/slideclone-core/archetypes/diagram-archetypes.js",
  "packages/slideclone-core/archetypes/diagram-component-strategy.js",
  "packages/slideclone-core/archetypes/diagram-constants.js",
  "packages/slideclone-core/archetypes/diagram-geometry.js",
  "packages/slideclone-core/quality/diagram-metrics.js",
  "packages/slideclone-core/archetypes/diagram-residual-analysis.js",
  "packages/slideclone-core/archetypes/diagram-structure-signature.js",
  "packages/slideclone-core/archetypes/diagram-understanding-entry.js",
  "packages/slideclone-core/archetypes/diagram-understanding.js",
  "packages/slideclone-core/archetypes/diagram-visual-topology.js",
  "packages/slideclone-core/archetypes/fishbone-visual-atoms.js",
  "packages/slideclone-core/scene-plan/layer-classifier.js",
  "packages/slideclone-core/archetypes/pixel-concentric-detector.js",
  "packages/slideclone-core/archetypes/pixel-venn-detector.js",
  "packages/slideclone-core/archetypes/semantic-matrix-grid.js",
  "packages/slideclone-core/scene-plan/visual-atom-components.js",
  "packages/slideclone-core/scene-plan/visual-atom-constants.js",
  "packages/slideclone-core/scene-plan/visual-atom-dense-nodes.js",
  "packages/slideclone-core/scene-plan/visual-atom-extractor.js",
  "packages/slideclone-core/scene-plan/visual-atom-line-components.js",
  "packages/slideclone-core/scene-plan/visual-atom-semantic-components.js",
  "packages/slideclone-core/archetypes/visual-column-bar-boundary.js",
  "packages/slideclone-core/scene-plan/visual-atom-shape-recognition.js",
  "packages/slideclone-core/scene-plan/visual-atom-gear-contour.js",
  "packages/slideclone-core/scene-plan/visual-atom-utils.js",
  "packages/slideclone-core/scene-plan/visual-atoms.js",
  "packages/slideclone-core/archetypes/visual-concentric-circles.js",
  "packages/slideclone-core/archetypes/visual-grid-cells.js",
  "packages/slideclone-core/archetypes/visual-pie-segments.js",
  "packages/slideclone-core/archetypes/visual-quadrant-panels.js",
  "packages/slideclone-core/archetypes/visual-sankey-bands.js",
  "packages/cli/verification/project-audit-runtime.js",
  "packages/cli/verification/verify-plugins.js",
  "packages/cli/verification/verify-capability-contracts.js",
  "packages/cli/verification/verify-capability-catalogs.js",
  "packages/cli/verification/release-evidence.js",
  "packages/cli/verification/verify-release-signature.js",
  "packages/cli/verification/generate-sbom.js",
  "packages/slideclone-core/scene-plan/raster-native-detection.js",
  "packages/slideclone-core/scene-plan/enclosed-light-ink.js",
  "packages/slideclone-core/archetypes/structured-residual-splitting.js",
  "packages/slideclone-core/scene-plan/residual-component-analysis.js",
  "packages/slideclone-core/scene-plan/residual-primitive-erasure.js",
  "packages/slideclone-core/quality/reconstruction-contract.js",
  "packages/slideclone-core/quality/reconstruction-quality-budget.js",
    "packages/slideclone-core/deck-ir-structure.js",
    "packages/slideclone-core/deck-ir-tree.js",
    "packages/slideclone-core/deck-ir-admission.js",
    "packages/slideclone-core/archive-admission.js",
    "packages/slideclone-core/jpeg-container-admission.js",
    "packages/slideclone-core/archetypes/structured-source-images.js",
    "packages/slideclone-core/native-rebuilder-registry.js",
    "packages/slideclone-core/archetypes/horizontal-step-chain.js",
    "packages/slideclone-core/archetypes/hierarchy-diagram.js",
    "packages/slideclone-core/archetypes/triangle-topology.js",
    "packages/slideclone-core/archetypes/cover-engine-core.js",
    "packages/slideclone-core/archetypes/dense-radial-network-shapes.js",
    "packages/slideclone-core/archetypes/network-native-shapes.js",
    "packages/slideclone-core/normalized-pages-admission.js",
    "packages/slideclone-core/quality/reconstruction-contract-validation.js",
    "packages/slideclone-core/deck-template-context.js",
    "packages/slideclone-core/template-build-admission.js",
    "packages/slideclone-core/archetypes/delivery-artifacts.js",
    "packages/slideclone-core/archetypes/diagram-residual-crops.js",
    "packages/slideclone-core/scene-plan/residual-splitting.js",
    "packages/slideclone-core/archetypes/workflow-shape-primitives.js",
    "packages/slideclone-core/archetypes/prd-generation-shapes.js",
    "packages/slideclone-core/quality/prototype-validation-shapes.js",
    "packages/slideclone-core/archetypes/demand-understanding-shapes.js",
    "packages/slideclone-core/scene-plan/page-native-graphics-stage.js",
    "packages/slideclone-core/scene-plan/page-hybrid-graphics-stage.js",
    "packages/slideclone-core/quality/native-output-sanitizer.js",
    "packages/slideclone-core/archetypes/prd-auto-generation-narrative.js",
    "packages/slideclone-core/scene-plan/color-component-bounds.js",
  "packages/slideclone-core/archetypes/image-layer-metadata.js",
  "packages/slideclone-core/quality/graphic-expression-policy.js",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeResidualLayerPlan.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeComponentGroupPlan.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/OutputEditGroupPlan.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeRelationshipAttachmentAudit.cs",
  "packages/slideclone-core/scene-plan/approved-opaque-backdrop-input.js",
  "packages/slideclone-core/scene-plan/approved-opaque-backdrop-application.js",
  "packages/slideclone-core/scene-plan/page-output-finalizer.js",
  "packages/slideclone-core/scene-plan/page-shape-finalizer.js",
  "packages/slideclone-core/typography/page-text-finalizer.js",
  "packages/remote-mcp-server/redis-connection.js",
  "packages/capability-manifests/image-to-editable/capability.manifest.json",
  "packages/slideclone-core/index.js",
  "packages/slideclone-core/document-input.js",
  "packages/cli/slideclone-runner.js",
  "packages/slideclone-core/native-rebuild-profile.js",
  "packages/slideclone-core/team-native-rebuild.js",
  "packages/slideclone-core/ocr/ocr-source-deck.js",
  "packages/slideclone-core/ocr/ocr-text-quadrilateral.js",
  "packages/slideclone-core/ocr/ocr-graphic-evidence-admission.js",
  "packages/slideclone-core/ocr/ocr-source-graphic-evidence.js",
  "packages/slideclone-core/ocr/ocr-source-icon-evidence.js",
  "packages/slideclone-core/routing/axis-stroke-evidence.js",
  "packages/slideclone-core/scene-plan/source-icon-primitive-evidence.js",
  "packages/slideclone-core/archetypes/leading-icon-crop-evidence.js",
  "packages/slideclone-core/archetypes/leading-icon-crop-materializer.js",
  "packages/slideclone-core/routing/source-connector-crop-contour.js",
  "packages/slideclone-core/scene-plan/source-native-finalization.js",
  "packages/slideclone-core/ocr/ocr-glyph-residual.js",
  "packages/slideclone-worker-adapter/ocr-checkpoint.js",
  "packages/slideclone-core/ocr/ocr-result-admission.js",
  "packages/slideclone-core/ocr/ocr-word-position-hints.js",
  "packages/slideclone-core/typography/source-word-layout-evidence.js",
  "packages/slideclone-core/typography/source-word-raster-edge.js",
  "packages/slideclone-core/typography/source-word-spacing-units.js",
  "packages/slideclone-core/typography/source-word-font-identity.js",
  "packages/slideclone-core/typography/source-word-typographic-geometry.js",
  "packages/slideclone-core/typography/source-word-layout-projection.js",
  "packages/slideclone-core/typography/source-word-layout-registry.js",
  "packages/slideclone-core/typography/source-word-rotated-frame.js",
  "packages/slideclone-core/scene-plan/source-row-whitespace-corridor.js",
  "packages/slideclone-core/scene-plan/source-row-component-ownership.js",
  "packages/slideclone-core/typography/source-word-joint-observation.js",
  "packages/slideclone-core/typography/text-ink-joint-evidence.js",
  "packages/slideclone-core/quality/component-region-quality.js",
  "packages/slideclone-core/typography/positioned-text-reframe.js",
  "packages/slideclone-core/scene-plan/deferred-source-word-layout.js",
  "packages/slideclone-core/typography/positioned-text-layout.js",
  "packages/slideclone-core/rebuilt-page-metadata.js",
  "packages/slideclone-core/scene-plan/page-image-finalizer.js",
  "packages/slideclone-core/scene-plan/page-progress-lifecycle.js",
  "packages/slideclone-core/scene-plan/page-graphics-stage.js",
  "packages/slideclone-core/scene-plan/page-semantic-claims.js",
  "packages/slideclone-core/native-rebuilder-policy.js",
  "packages/slideclone-core/scene-plan/native-object-conflict-arbitrator.js",
  "packages/slideclone-core/archetypes/skills-capability-matrix.js",
  "packages/slideclone-core/archetypes/demand-intake-funnel.js",
  "packages/slideclone-core/archetypes/smart-review-branch-gate.js",
  "packages/slideclone-core/archetypes/skill-chain-orchestration.js",
  "packages/slideclone-core/archetypes/asset-landing-triad.js",
  "packages/slideclone-core/slide-size.js",
  "packages/slideclone-core/png.js",
  "packages/slideclone-core/pptx-openxml-dotnet.js",
  "packages/slideclone-core/pptx-build-execution.js",
  "packages/slideclone-core/pptx-build-mode.js",
  "packages/slideclone-core/typography/native-text-style.js",
  "packages/slideclone-core/archetypes/screenshot-flow-reconstruction.js",
  "packages/slideclone-core/typography/screenshot-texture-evidence.js",
  "packages/slideclone-worker-adapter/team-structured-deck-archive.js",
  "packages/slideclone-core/archetypes/tool-platform-reconstruction.js",
  "packages/slideclone-core/quality/review-risk-reconstruction.js",
  "packages/slideclone-core/openxml-build-jobs.js",
  "packages/slideclone-core/archetypes/chart-native-payload.js",
  "packages/slideclone-core/scene-plan/native-chart-shell-shapes.js",
  "packages/slideclone-core/archetypes/restricted-svg.js",
  "packages/slideclone-core/openxml-build-cache.js",
  "packages/slideclone-core/pptx-zip.js",
  "packages/ooxml-core/pptx-zip.js",
  "packages/slideclone-core/cache-budget.js",
  "packages/slideclone-core/render-libreoffice.js",
  "packages/slideclone-core/archetypes/presentation-frame.js",
  "packages/slideclone-core/renderer-process.js",
  "packages/slideclone-core/libreoffice-tools.js",
  "packages/slideclone-core/diff-pixel-png.js",
  "packages/slideclone-core/quality/missing-native-component-quality.js",
  "packages/slideclone-core/pixel-diff-page-worker.js",
  "packages/slideclone-core/scene-plan/edge-background-alpha.js",
  "packages/slideclone-core/archetypes/icon-crop-refiner.js",
  "packages/slideclone-core/archetypes/knowledge-graph-icon-crops.js",
  "packages/slideclone-core/archetypes/full-slide-native-residual.js",
  "packages/slideclone-core/scene-plan/residual-branch-result.js",
  "packages/slideclone-core/archetypes/arc-residual-masks.js",
  "packages/slideclone-core/archetypes/semantic-arc-admission.js",
  "packages/slideclone-core/archetypes/semantic-rebuild-transaction.js",
  "packages/slideclone-core/scene-plan/source-border-fit.js",
  "packages/slideclone-core/routing/source-native-edge-refinement.js",
  "packages/slideclone-core/routing/source-node-connectors.js",
  "packages/slideclone-core/scene-plan/source-icon-layer-order.js",
  "packages/slideclone-core/scene-plan/source-semantic-curves.js",
  "packages/slideclone-core/archetypes/missing-blob-components.js",
  "packages/slideclone-core/routing/source-horizontal-connector-fit.js",
  "packages/slideclone-core/archetypes/knowledge-graph-gray-node-fit.js",
  "packages/slideclone-core/archetypes/gray-border-pixels.js",
  "packages/slideclone-core/archetypes/gray-border-residual.js",
  "packages/slideclone-core/typography/text-ink-geometry.js",
  "packages/slideclone-core/typography/text-weight-evidence.js",
  "packages/slideclone-core/typography/measured-text-fit.js",
  "packages/slideclone-core/owned-text-advance.js",
  "packages/slideclone-core/owned-text-eligibility.js",
  "packages/slideclone-core/typography/source-owned-glyph-shapes.js",
  "packages/slideclone-core/owned-text-probe.js",
  "packages/slideclone-core/owned-text-runtime-profile.js",
  "packages/slideclone-worker-adapter/native-only-owned-text-refinement.js",
  "packages/remote-mcp-server/owned-text-refiner.js",
  "packages/slideclone-core/owned-text-refinement.js",
  "packages/slideclone-core/owned-text-target-window.js",
  "packages/slideclone-core/owned-source-snapshot.js",
  "packages/slideclone-worker-adapter/progressive-owned-text-refinement.js",
  "packages/slideclone-worker-adapter/provisional-native-search.js",
  "packages/slideclone-worker-adapter/worker-execution-budget.js",
  "packages/slideclone-worker-adapter/worker-budget-runner.js",
  "packages/slideclone-worker-adapter/worker-diagnostic-candidate.js",
  "packages/slideclone-worker-adapter/native-only-shadow-session.js",
  "packages/slideclone-worker-adapter/native-underlay-removal-proposal.js",
  "packages/slideclone-worker-adapter/candidate-verification-cache.js",
  "packages/slideclone-worker-adapter/rendered-page-snapshot-cache.js",
  "packages/slideclone-core/owned-text-residual.js",
  "packages/slideclone-worker-adapter/native-only-stroke-refinement.js",
  "packages/slideclone-worker-adapter/pictorial-candidate-transaction.js",
  "packages/slideclone-core/ocr/ocr-confidence-evidence.js",
  "packages/slideclone-core/ocr/ocr-line-consensus.js",
  "packages/slideclone-core/ocr/ocr-source-refinement.js",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeTextWarp.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativePositionedText.cs",
  "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/NativeFontTypeface.cs",
  "packages/slideclone-core/typography/text-refinement-coordinator.js",
  "packages/slideclone-core/archetypes/knowledge-graph-relation-fit.js",
  "packages/slideclone-core/scene-plan/residual-publication.js",
  "packages/slideclone-core/scene-plan/page-reuse.js",
  "packages/slideclone-core/typography/diagram-text-candidates.js",
  "packages/slideclone-core/quality/graphic-crop-policy.js",
  "packages/slideclone-core/scene-plan/page-selection.js",
  "packages/slideclone-core/scene-plan/native-rebuild-deck-pipeline.js",
  "packages/slideclone-core/progress-reporter.js",
  "packages/slideclone-core/archetypes/knowledge-graph-native.js",
  "packages/slideclone-worker-adapter/team-raw-image-archive.js",
  "packages/slideclone-worker-adapter/team-document-normalizer.js",
  "packages/slideclone-worker-adapter/team-render-quality.js",
  "packages/slideclone-worker-adapter/team-worker.js",
  "packages/slideclone-worker-adapter/source-light-panel-geometry.js",
  "packages/slideclone-worker-adapter/redundant-panel-backgrounds.js",
    "packages/slideclone-worker-adapter/native-only-panel-refinement.js",
  "packages/slideclone-worker-adapter/native-only-text-weight-refinement.js",
  "packages/slideclone-worker-adapter/text-candidate-rollback.js",
  "packages/slideclone-worker-adapter/text-comparison-session.js",
    "packages/slideclone-worker-adapter/panel-candidate-rollback.js",
  "packages/slideclone-worker-adapter/missing-candidate-rollback.js",
  "packages/slideclone-worker-adapter/native-only-missing-refinement.js",
  "packages/slideclone-worker-adapter/candidate-pair-executor.js",
  "packages/slideclone-worker-adapter/native-only-refinement.js",
  "packages/slideclone-worker-adapter/package.json",
  "packages/team-runtime/worker-failure.js",
  "packages/team-runtime/worker-lease.js",
  "packages/team-runtime/worker-context.js",
  "packages/team-runtime/job-row-reader.js",
  "packages/team-runtime/worker-runner.js",
  "packages/team-runtime/retention-output-keys.js",
  "packages/remote-mcp-server/bin/common-tools-team-image-worker.js",
  "plugins/common-tools/skills/image-to-editable/SKILL.md",
  "plugins/codex/image-to-editable/skills/image-to-editable/SKILL.md"
]);
const PPT_CREATE_RELEASE_FILES = Object.freeze([
  "packages/capability-manifests/ppt-create/capability.manifest.json",
  "packages/ppt-create-core/index.js",
  "packages/ppt-create-core/spec.js",
  "packages/ppt-create-core/assets.js",
  "packages/ppt-create-core/image-delivery.js",
  "packages/ppt-create-core/ir-editor.js",
  "packages/ppt-create-core/ir-network-reflow.js",
  "packages/ppt-create-core/editable-data-validation.js",
  "packages/ppt-create-core/ir-editor-client.js",
  "packages/ppt-create-core/ir-editor-session.js",
  "packages/ppt-create-core/ir-lifecycle.js",
  "packages/ppt-create-core/document-ingest.js",
  "packages/ppt-create-core/pdf-text.js",
  "packages/ppt-create-core/template.js",
  "packages/ppt-create-core/variants.js",
  "packages/ppt-create-core/content-metadata.js",
  "packages/ppt-create-core/content-provider.js",
  "packages/ppt-create-core/team-worker.js",
  "packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker.js",
  "deploy/compose.team-ppt-create-provider.yaml",
  "packages/ppt-create-core/team-archive.js",
  "packages/ppt-create-core/theme-registry.js",
  "packages/ppt-create-core/layout-registry.js",
  "packages/ppt-create-core/data-models.js",
  "packages/ppt-create-core/editor.js",
  "packages/ppt-create-core/export.js",
  "packages/ppt-create-core/libreoffice-pdf.js",
  "packages/ppt-create-core/planner.js",
  "packages/ppt-create-core/prompt.js",
  "packages/ppt-create-core/semantic-components.js",
  "packages/ppt-create-core/layout.js",
  "packages/ppt-create-core/presentation-brief.schema.json",
  "packages/ppt-create-core/presentation-spec.schema.json",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/DeckPackageWriter.cs",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/Models.cs",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/TextCharacterSpacing.cs",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/PptxPackageAdmissionValidator.cs",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/SpeakerNotesWriter.cs",
  "plugins/common-tools/skills/ppt-create/SKILL.md"
]);
const REQUIRED_FILES = Object.freeze([
  ".agents/plugins/marketplace.json",
  "package.json",
  "config/architecture-closeout-checklist.json",
  "packages/cli/bin/common-tools.js",
  "packages/cli/production-env-file.js",
  "packages/capability-registry/index.js",
  "packages/capability-registry/package.json",
  "packages/mcp-server/core.js",
  "packages/team-runtime/schema/010_retention_recheck.sql",
  "packages/team-runtime/schema/011_delivery_outbox.sql",
  "scripts/verify-architecture-closeout.js",
  "scripts/generate-sbom.js",
  "scripts/release-evidence.js",
  "scripts/generate-image-ocr-release-input.js",
  "scripts/generate-remote-plugin-bundles.js",
  "scripts/common-tools-docker-engine.ps1",
  "scripts/team-runtime-compose-smoke.ps1",
  "scripts/team-runtime-local-apply.ps1",
  "scripts/team-runtime-local-deploy.ps1",
  "scripts/team-runtime-local-acceptance.ps1",
  "scripts/team-runtime-local-closeout.ps1",
  "scripts/verify-local-acceptance-evidence.js",
  "scripts/team-runtime-local-job-smoke.ps1",
  "scripts/team-runtime-local-repair-migration-ledger.ps1",
  "scripts/team-runtime-local-smoke.ps1",
  "scripts/team-runtime-authenticated-job-smoke.js",
  "scripts/team-runtime-production-acceptance.ps1",
  "scripts/team-keycloak-local-test-user.ps1",
  "scripts/team-keycloak-mcp-client-sync.ps1",
  "scripts/team-keycloak-recovery-admin.ps1",
  "scripts/team-runtime-production-deploy.ps1",
  "scripts/team-runtime-operation-lock.ps1",
  "scripts/team-runtime-postgres-restore-drill.ps1",
  "scripts/team-runtime-object-store-restore-drill.ps1",
  "scripts/team-postgres-volume-backup.ps1",
  "scripts/team-keycloak-volume-backup.ps1",
  "scripts/team-keycloak-volume-restore-drill.ps1",
  "scripts/team-keycloak-persistence-migrate.ps1",
  "scripts/team-minio-volume-backup.ps1",
  "scripts/team-runtime-local-fresh-reset.ps1",
  "scripts/team-runtime-doctor.js",
  "packages/slideclone-native-engine/scripts/slideclone.js",
  "packages/slideclone-native-engine/scripts/adapters/validate-powerpoint-com.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-roundtrip-evidence.js",
    "packages/slideclone-native-engine/scripts/lib/powerpoint-connector-roundtrip.js",
    "packages/slideclone-native-engine/scripts/lib/powerpoint-shape-targets.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-open-evidence.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-session-client.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-session-broker.js",
  "packages/slideclone-native-engine/scripts/lib/powerpoint-corpus-session.js",
  "packages/slideclone-native-engine/scripts/lib/progress-reporter.js",
  "skills/pd-hifi-slideclone/schemas/slideclone.config.schema.json",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/OpenXmlDeckBuilder.csproj",
  "packages/remote-mcp-server/worker-settings.js",
  "packages/remote-mcp-server/image-worker-settings.js",
  "packages/team-runtime/team-config.js",
  "packages/team-runtime/job-input.js",
    "packages/team-runtime/job-row-state.js",
  ...IMAGE_EDITABLE_RELEASE_FILES,
  ...PPT_CREATE_RELEASE_FILES
]);
const FORBIDDEN_PREFIXES = Object.freeze([
  ".codex-tmp/",
  "node_modules/",
  "runs/",
  "test/",
  "skills/pd-hifi-slideclone/examples/",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/bin/",
    "packages/slideclone-native-engine/dotnet/OpenXmlDeckBuilder/obj/"
]);

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function normalFile(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || value.includes("../")) throw new Error(`${label} is invalid`);
  return value;
}

function parsePackMetadata(stdout) {
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error("npm pack returned invalid metadata"); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !plainObject(parsed[0])) throw new Error("npm pack returned invalid metadata");
  const metadata = parsed[0];
  const filename = normalFile(metadata.filename, "package filename");
  if (!Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_PACKAGE_BYTES) throw new Error("runtime package size is invalid");
  if (!Array.isArray(metadata.files) || metadata.files.length === 0 || metadata.files.length > 5000) throw new Error("runtime package file list is invalid");
  const files = metadata.files.map((entry) => {
    if (!plainObject(entry) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error("runtime package file list is invalid");
    return normalFile(entry.path, "runtime package file");
  });
  if (new Set(files).size !== files.length) throw new Error("runtime package file list is invalid");
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error("runtime package is missing a required file");
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (files.some((file) => file.startsWith(prefix))) throw new Error("runtime package includes a forbidden file");
  }
  if (metadata.name !== "common-tools") throw new Error("runtime package identity is invalid");
  return Object.freeze({ name: metadata.name, filename, size: metadata.size, files: Object.freeze(files) });
}

function normalDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`${label} is invalid`);
  const details = fs.statSync(value);
  if (!details.isDirectory()) throw new Error(`${label} is invalid`);
  return value;
}

function runClassifiedProbe(commandRunner, argumentsList, cwd, failureMessage, profile = "standard") {
  return runRuntimeProbe(commandRunner, process.execPath, argumentsList, cwd, failureMessage, profile);
}

function npmCliPath(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["execPath", "npmExecPath"].includes(key))) throw new TypeError("npm CLI options are invalid");
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  if (typeof execPath !== "string" || !path.isAbsolute(execPath)) throw new TypeError("Node executable path is invalid");
  const executableDirectory = path.dirname(execPath);
  const installationRoot = path.basename(executableDirectory).toLowerCase() === "bin" ? path.dirname(executableDirectory) : executableDirectory;
  const candidates = [
    npmExecPath,
    path.join(installationRoot, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(installationRoot, "lib", "node_modules", "npm", "bin", "npm-cli.js")
  ];
  for (const candidate of [...new Set(candidates)]) {
    if (typeof candidate !== "string" || !path.isAbsolute(candidate)) continue;
    const relative = path.relative(installationRoot, candidate);
    if (relative === "" || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) continue;
    if (!candidate.endsWith(path.join("node_modules", "npm", "bin", "npm-cli.js"))) continue;
    try {
      const details = fs.lstatSync(candidate);
      if (details.isFile() && !details.isSymbolicLink()) return candidate;
    } catch {
      // Continue through the bounded Node installation layouts.
    }
  }
  throw new Error("Node npm CLI is unavailable");
}

function npmInvocation(argumentsList, options) {
  if (!Array.isArray(argumentsList) || argumentsList.some((value) => typeof value !== "string")) throw new TypeError("npm invocation is invalid");
  const command = options?.execPath ?? process.execPath;
  return Object.freeze({ command, arguments: Object.freeze([npmCliPath(options), ...argumentsList]) });
}

function installedCliPath(installRoot) {
  const executable = process.platform === "win32" ? "common-tools.cmd" : "common-tools";
  const target = path.join(installRoot, "node_modules", ".bin", executable);
  const details = fs.lstatSync(target);
  if (!details.isFile() && !details.isSymbolicLink()) throw new Error("installed runtime CLI shim is missing");
  return path.join(installRoot, "node_modules", "common-tools", "packages", "cli", "bin", "common-tools.js");
}

function runtimePackageFolders(repositoryRoot) {
  const packagesRoot = path.join(normalDirectory(repositoryRoot, "repository root"), "packages");
  return Object.freeze(fs.readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(packagesRoot, entry.name, "package.json")))
    .map((entry) => entry.name)
    .sort());
}

function collectPackageSurfaceTargets(value, label = "package surface") {
  const targets = [];
  function collect(current, currentLabel) {
    if (typeof current === "string") {
      targets.push(Object.freeze({ label: currentLabel, target: current }));
      return;
    }
    if (!plainObject(current)) throw new TypeError(`${label} is invalid`);
    for (const [name, child] of Object.entries(current).sort(([left], [right]) => left.localeCompare(right))) {
      collect(child, currentLabel === "exports" ? `exports[${name}]` : `${currentLabel}.${name}`);
    }
  }
  if (typeof value.main === "string") targets.push(Object.freeze({ label: "main", target: value.main }));
  else if (Object.hasOwn(value, "main")) throw new TypeError(`${label} main is invalid`);
  if (Object.hasOwn(value, "exports")) collect(value.exports, "exports");
  return Object.freeze(targets);
}

function verifyInstalledPackageSurfaces(packageRoot, expectedPackageFolders) {
  const packagesRoot = path.join(normalDirectory(packageRoot, "installed package root"), "packages");
  const packageNames = [];
  for (const entry of fs.readdirSync(packagesRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const packageDirectory = path.join(packagesRoot, entry.name);
    const manifestPath = path.join(packageDirectory, "package.json");
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || manifest.name.split("/")[1] !== entry.name) throw new Error("installed runtime package identity is invalid");
    packageNames.push(entry.name);
    for (const { target } of collectPackageSurfaceTargets(manifest, "installed runtime package surface")) {
      if (path.isAbsolute(target) || target.includes("\0")) throw new Error("installed runtime package surface is invalid");
      const resolved = path.resolve(packageDirectory, target);
      const relative = path.relative(packageDirectory, resolved);
      if (relative === "" || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw new Error("installed runtime package surface escapes the package");
      const details = fs.statSync(fs.realpathSync(resolved));
      if (!details.isFile()) throw new Error("installed runtime package surface is missing");
    }
  }
  if (packageNames.length === 0) throw new Error("installed runtime package surfaces are missing");
  if (expectedPackageFolders !== undefined) {
    if (!Array.isArray(expectedPackageFolders) || expectedPackageFolders.some((item) => typeof item !== "string" || !item)) throw new TypeError("expected runtime package folders are invalid");
    if (JSON.stringify(packageNames) !== JSON.stringify([...expectedPackageFolders].sort())) throw new Error("installed runtime package set does not match the workspace package set");
  }
  return Object.freeze(packageNames);
}

function imageEditableEnhancementProbe() {
  return [
    "let stage='initialization';try{const fs=require('node:fs');const path=require('node:path');",
    "const root=path.resolve(process.argv[1]);",
    "stage='manifest-load';",
    "const manifest=require(path.join(root,'packages','capability-manifests','image-to-editable','capability.manifest.json'));",
    "const version=String(manifest.version||'').split('.').map(Number);",
    "stage='core-load';",
    "const native=require(path.join(root,'packages','slideclone-core','team-native-rebuild.js'));const profile=require(path.join(root,'packages','slideclone-core','native-rebuild-profile.js'));",
    "const worker=require(path.join(root,'packages','slideclone-worker-adapter','team-worker.js'));const archive=require(path.join(root,'packages','slideclone-worker-adapter','team-raw-image-archive.js'));const documentNormalizer=require(path.join(root,'packages','slideclone-worker-adapter','team-document-normalizer.js'));const quality=require(path.join(root,'packages','slideclone-worker-adapter','team-render-quality.js'));",
    "const archiveAdmission=require(path.join(root,'packages','slideclone-core','archive-admission.js'));const normalizedAdmission=require(path.join(root,'packages','slideclone-core','normalized-pages-admission.js'));let oversizedPagesRejected=false;try{normalizedAdmission.admitNormalizedPages({sources:Array.from({length:21},()=>({})),pages:21,assets:21},root);}catch(error){oversizedPagesRejected=error instanceof TypeError&&error.message==='document normalization returned an invalid page set';}",
    "const residual=require(path.join(root,'packages','slideclone-core','archetypes/full-slide-native-residual.js'));",
    "stage='source-read';",
    "const nativeSource=fs.readFileSync(path.join(root,'packages','slideclone-core','team-native-rebuild.js'),'utf8');const localCoreSource=fs.readFileSync(path.join(root,'packages','slideclone-core','index.js'),'utf8');const cliSource=fs.readFileSync(path.join(root,'packages','cli','bin','common-tools.js'),'utf8');",
    "const workerSource=fs.readFileSync(path.join(root,'packages','slideclone-worker-adapter','worker-job-runner.js'),'utf8');",
    "const remoteSource=fs.readFileSync(path.join(root,'packages','remote-mcp-server','bin','common-tools-team-image-worker.js'),'utf8');",
    "const factorySource=fs.readFileSync(path.join(root,'packages','remote-mcp-server','image-native-rebuilder.js'),'utf8');",
    "const skill=fs.readFileSync(path.join(root,'plugins','common-tools','skills','image-to-editable','SKILL.md'),'utf8');const localSkill=fs.readFileSync(path.join(root,'plugins','codex','image-to-editable','skills','image-to-editable','SKILL.md'),'utf8');",
    "const versionReady=version.length===3&&version.every(Number.isSafeInteger)&&(version[0]>0||version[1]>1||(version[1]===1&&version[2]>=7));",
    "const checks=[['capability-version',versionReady],['native-export',typeof native.residualEraseObjects==='function'],['production-profile',profile.PRODUCTION_PROFILE_NAME==='local-production-parity-v1'&&profile.createProductionNativeRebuildOptions().vectorizeStatusIcons===false],['worker-export',typeof worker.residualDeduplicationStatus==='function'],['source-archive-export',typeof archive.createEditableSourceArchive==='function'&&archive.MAX_RAW_IMAGE_ARCHIVE_PAGES===20],['document-normalizer-export',typeof documentNormalizer.createTeamDocumentNormalizer==='function'&&documentNormalizer.MAX_DOCUMENT_PAGES===20],['batch-quality-export',typeof quality.createRawImageRenderQualityVerifier==='function'],['local-batch-core',localCoreSource.includes('MAX_EDITABLE_BATCH_INPUTS')&&localCoreSource.includes('inputPaths')&&localCoreSource.includes('EDITABLE_DOCUMENT_EXTENSIONS')],['local-batch-cli',cliSource.includes('editable batch')&&cliSource.includes('editable-source-archive')&&cliSource.includes('--inputs')],['local-batch-skill',localSkill.includes('common-tools editable batch')&&localSkill.includes('normalize.maxPages')&&localSkill.includes('200,000,000 decoded pixels')],['residual-export',typeof residual.eraseObjectMask==='function'],['remote-worker-wiring',remoteSource.includes('createNativeRebuilder')&&remoteSource.includes('createTeamDocumentNormalizer')&&remoteSource.includes('image-native-rebuilder')&&factorySource.includes('full-slide-native-residual')&&factorySource.includes('preserveLocalFidelityImages: true')],['native-strategy',nativeSource.includes('full-slide-object-erased-residual')],['worker-quality-gate',workerSource.includes('residual-native-duplicates-removed')&&workerSource.includes('local-production-profile-aligned')],['source-worker-contract',workerSource.includes('raw-image-batch-validated')&&workerSource.includes('document-pages-normalized')&&workerSource.includes('admitNormalizedPages')&&archiveAdmission.MAX_RAW_IMAGE_PAGES===20&&typeof archiveAdmission.createArchiveAdmission==='function'&&oversizedPagesRejected],['marketplace-skill-gate',skill.includes('residual-native-duplicates-removed')&&skill.includes('local-production-profile-aligned')&&skill.includes('raw-image-batch-validated')&&skill.includes('document-pages-normalized')]];",
    "const failed=checks.find((entry)=>!entry[1]);if(failed){process.stdout.write(failed[0]);process.exit(2);}process.stdout.write('ready');",
    "}catch{process.stdout.write(stage);process.exit(2);}"
  ].join("");
}

function pptCreateLayoutProbe() {
  return [
    "let stage='initialization';try{const fs=require('node:fs');const path=require('node:path');",
    "const root=path.resolve(process.argv[1]);",
    "stage='manifest-load';const manifest=require(path.join(root,'packages','capability-manifests','ppt-create','capability.manifest.json'));",
    "const version=String(manifest.version||'').split('.').map(Number);",
    "stage='registry-load';const themes=require(path.join(root,'packages','ppt-create-core','theme-registry.js'));const layouts=require(path.join(root,'packages','ppt-create-core','layout-registry.js'));const models=require(path.join(root,'packages','ppt-create-core','data-models.js'));const semantic=require(path.join(root,'packages','ppt-create-core','semantic-components.js'));const editor=require(path.join(root,'packages','ppt-create-core','editor.js'));const exporter=require(path.join(root,'packages','ppt-create-core','export.js'));const pdf=require(path.join(root,'packages','ppt-create-core','libreoffice-pdf.js'));const briefPlanner=require(path.join(root,'packages','ppt-create-core','planner.js'));const layoutPlanner=require(path.join(root,'packages','ppt-create-core','layout.js'));const briefSchema=require(path.join(root,'packages','ppt-create-core','presentation-brief.schema.json'));const schema=require(path.join(root,'packages','ppt-create-core','presentation-spec.schema.json'));",
    "stage='source-read';const skill=fs.readFileSync(path.join(root,'plugins','common-tools','skills','ppt-create','SKILL.md'),'utf8');",
    "stage='plan';const input={version:'1.0',title:'Release probe',theme:'clean-light-v1',seed:'release-probe',variantCount:3,slides:[{id:'cover',role:'cover',title:'Release probe'}]};const first=layoutPlanner.createLayoutPlan(input);const second=layoutPlanner.createLayoutPlan(input);",
    "stage='data-model';const chart=models.normalizeVisual({kind:'chart',type:'column',categories:['A','B'],series:[{name:'Value',values:[1,2]}]},'probe chart');const payload=models.nativeChartPayload(chart,{barFill:'#175CD3'});",
    "stage='semantic-component';const component=semantic.planSemanticAnalysis({kind:'analysis',model:'funnel',entries:[{id:'top'},{id:'bottom'}]},{x:0,y:0,w:400,h:200});",
    "stage='editor';const editorModel=editor.createEditorModel(input);const html=editor.createPreviewHtml(input,layoutPlanner.createDeckIr(input));const edited=editor.applyEditorPatch(input,{version:'1.0',expectedRevision:editorModel.revision,operations:[{type:'set-slide-text',slideId:'cover',field:'title',value:'Edited probe'}]});",
    "stage='formats';const deckIr=layoutPlanner.createDeckIr(input);const printable=exporter.createPrintableHtml(deckIr);const fingerprint=exporter.deckIrFingerprint(deckIr);",
    "stage='brief-plan';const planned=briefPlanner.planPresentation({version:'1.0',title:'Brief probe',audience:'Reviewers',purpose:'Approve direction',maxSlides:3,sections:[{id:'facts',title:'Facts',points:[{id:'fact',label:'Verified fact'}]}]});",
    "const versionReady=version.length===3&&version.every(Number.isSafeInteger)&&(version[0]>0||version[1]>1||(version[1]===1&&version[2]>=6));",
    "const candidates=first.pages&&first.pages[0]&&first.pages[0].candidates;",
    "const checks=[['capability-version',versionReady],['theme-registry',Array.isArray(themes.THEME_REGISTRY)&&themes.THEME_REGISTRY.length>=4],['layout-registry',Array.isArray(layouts.LAYOUT_REGISTRY)&&layouts.LAYOUT_REGISTRY.length>=22],['layout-export',typeof layoutPlanner.createLayoutPlan==='function'],['candidate-bounds',Array.isArray(candidates)&&candidates.length>=2&&candidates.length<=3],['deterministic-plan',JSON.stringify(first)===JSON.stringify(second)],['schema-variant-bound',schema.properties&&schema.properties.variantCount&&schema.properties.variantCount.maximum===3],['schema-semantic-visuals',schema.$defs&&schema.$defs.visual&&Array.isArray(schema.$defs.visual.oneOf)&&schema.$defs.visual.oneOf.length===4],['semantic-component-plan',component.component==='funnel'&&component.nodes[0].box.w>component.nodes[1].box.w],['native-chart-payload',payload.dataVerified===true&&/^[a-f0-9]{64}$/.test(payload.fallbackSha256)],['editor-preview',html.includes('PPT Preview Editor')&&html.includes('presentation-edit.patch.json')],['editor-persistence',edited.spec.slides[0].title==='Edited probe'&&edited.revision!==editorModel.revision],['format-export',printable.includes(fingerprint)&&typeof pdf.buildPdfWithLibreOffice==='function'],['brief-schema',briefSchema.properties&&briefSchema.properties.maxSlides&&briefSchema.properties.maxSlides.maximum===100],['brief-planning',planned.report.passed===true&&planned.report.checks.some((check)=>check.name==='planning-source-covered')],['marketplace-skill-gate',skill.includes('layout-candidates-available')&&skill.includes('layout-selection-resolved')&&skill.includes('semantic-visuals-resolved')&&skill.includes('semantic-component-plan-resolved')&&skill.includes('native-data-editable')&&skill.includes('deck.preview.html')&&skill.includes('ppt apply-edit')&&skill.includes('multi-format-page-count-matches')&&skill.includes('ppt plan')&&skill.includes('planning-source-covered')]];",
    "const failed=checks.find((entry)=>!entry[1]);if(failed){process.stdout.write(failed[0]);process.exit(2);}process.stdout.write('ready');",
    "}catch{process.stdout.write(stage);process.exit(2);}"
  ].join("");
}

function pptCreateEnhancementProbe() {
  return [
    "let stage='initialization';try{const fs=require('node:fs');const path=require('node:path');",
    "const root=path.resolve(process.argv[1]);",
    "stage='manifest-load';const manifest=require(path.join(root,'packages','capability-manifests','ppt-create','capability.manifest.json'));const version=String(manifest.version||'').split('.').map(Number);",
    "stage='module-load';const layout=require(path.join(root,'packages','ppt-create-core','layout.js'));const variants=require(path.join(root,'packages','ppt-create-core','variants.js'));const assets=require(path.join(root,'packages','ppt-create-core','assets.js'));const delivery=require(path.join(root,'packages','ppt-create-core','image-delivery.js'));const irEditor=require(path.join(root,'packages','ppt-create-core','ir-editor.js'));const irSession=require(path.join(root,'packages','ppt-create-core','ir-editor-session.js'));const irLifecycle=require(path.join(root,'packages','ppt-create-core','ir-lifecycle.js'));const irPageLifecycle=require(path.join(root,'packages','ppt-create-core','ir-page-lifecycle.js'));const ingest=require(path.join(root,'packages','ppt-create-core','document-ingest.js'));const prompt=require(path.join(root,'packages','ppt-create-core','prompt.js'));const contentProvider=require(path.join(root,'packages','ppt-create-core','content-provider.js'));const contentProviderConfig=require(path.join(root,'packages','ppt-create-core','content-provider-config.js'));const semantic=require(path.join(root,'packages','ppt-create-core','semantic-components.js'));const pdfText=require(path.join(root,'packages','ppt-create-core','pdf-text.js'));const template=require(path.join(root,'packages','ppt-create-core','template.js'));const metadata=require(path.join(root,'packages','ppt-create-core','content-metadata.js'));const worker=require(path.join(root,'packages','ppt-create-core','team-worker.js'));const teamArchive=require(path.join(root,'packages','ppt-create-core','team-archive.js'));const schema=require(path.join(root,'packages','ppt-create-core','presentation-spec.schema.json'));const briefSchema=require(path.join(root,'packages','ppt-create-core','presentation-brief.schema.json'));",
    "stage='asset-provenance';const assetManifest=assets.normalizeAssetManifest([{id:'hero',path:'assets/hero.png',sha256:'a'.repeat(64),source:{kind:'customer-provided',locator:'customer-upload',license:'customer-owned'}}]);",
    "stage='document-ingest';const outline=ingest.extractMarkdownOutline('# Probe\\n\\n## Facts\\n\\n- Verified point');const brief=ingest.outlineToBrief(outline,{audience:'Reviewers',purpose:'Approve direction',theme:'clean-light-v1',deckVariantCount:2,maxSlides:4});",
    "stage='template-safety';let generatedTemplateRejected=false;try{template.normalizeTemplate({path:'template.pptx',sha256:'b'.repeat(64),source:{kind:'generated',locator:'probe',license:'generated'},mode:'master-and-theme'});}catch{generatedTemplateRejected=true;}",
    "stage='variants';const spec={version:'1.0',title:'Enhancement probe',theme:'clean-light-v1',seed:'enhancement-probe',variantCount:2,deckVariantCount:2,slides:[{id:'cover',role:'cover',title:'Enhancement probe'},{id:'facts',role:'content',title:'Facts',items:[{id:'fact',label:'Verified point'}],citations:[{id:'source-1',title:'Primary source',locator:'https://example.com/source'}],speakerNotes:'Explain the verified point.'},{id:'close',role:'closing',title:'Next step'}]};const deckVariants=layout.createDeckVariants(spec);const variantRecords=variants.describeVariants(deckVariants);const notes=metadata.composeSpeakerNotes(spec.slides[1].speakerNotes,spec.slides[1].citations);const semanticBounds={x:0,y:0,w:800,h:300};const semanticEntries=Array.from({length:4},(_,index)=>({id:'n'+index,label:'N'+index}));const roadmap=semantic.planSemanticAnalysis({kind:'analysis',model:'roadmap',entries:semanticEntries},semanticBounds);const gantt=semantic.planSemanticAnalysis({kind:'analysis',model:'gantt',entries:semanticEntries},semanticBounds);",
    "stage='source-read';const skill=fs.readFileSync(path.join(root,'plugins','common-tools','skills','ppt-create','SKILL.md'),'utf8');const irEditorSource=fs.readFileSync(path.join(root,'packages','ppt-create-core','ir-editor.js'),'utf8');const irEditorClientSource=fs.readFileSync(path.join(root,'packages','ppt-create-core','ir-editor-client.js'),'utf8');const providerConfigSource=fs.readFileSync(path.join(root,'packages','ppt-create-core','content-provider-config.js'),'utf8');const packageWriter=fs.readFileSync(path.join(root,'packages','slideclone-native-engine','dotnet','OpenXmlDeckBuilder','DeckPackageWriter.cs'),'utf8');const admission=fs.readFileSync(path.join(root,'packages','slideclone-native-engine','dotnet','OpenXmlDeckBuilder','PptxPackageAdmissionValidator.cs'),'utf8');const notesWriter=fs.readFileSync(path.join(root,'packages','slideclone-native-engine','dotnet','OpenXmlDeckBuilder','SpeakerNotesWriter.cs'),'utf8');",
    "stage='editable-data-admission';const admissionDeck=structuredClone(deckVariants[0].ir);admissionDeck.pages[0].tables=[{id:'admission-table',box:{x:10,y:10,w:100,h:100},rows:[['valid']]}];irEditor.validateEditableIr(admissionDeck);admissionDeck.pages[0].tables[0].rows=[null];let malformedTableRejected=false;try{irEditor.validateEditableIr(admissionDeck);}catch{malformedTableRejected=true;}if(!malformedTableRejected){process.stdout.write(stage);process.exit(2);}",
    "const versionReady=version.length===3&&version.every(Number.isSafeInteger)&&(version[0]>0||version[1]>1||(version[1]===1&&version[2]>=13));",
    "if(!(irEditorClientSource.includes('showModal')&&irEditorClientSource.includes('openTableEditor')&&irEditorClientSource.includes('openChartEditor')&&!irEditorClientSource.includes('编辑图表 JSON'))){process.stdout.write('controlled-semantic-editor');process.exit(2);}",
    "const checks=[['capability-version',versionReady],['asset-provenance',assetManifest.length===1&&assetManifest[0].source.kind==='customer-provided'],['image-delivery',typeof delivery.createImageDeliveryArtifacts==='function'&&typeof delivery.createPreservationPlan==='function'],['ir-editor',typeof irEditor.applyAndExportIrArtifacts==='function'&&typeof irEditor.applyIrEditorPatch==='function'&&typeof irEditor.createIrPreviewHtml==='function'&&typeof irEditor.exportEditedIrArtifacts==='function'&&irEditorSource.includes('edit-finalization-report.json')&&irEditorSource.includes('set-table-cell')&&irEditorSource.includes('set-chart-data')&&irEditorSource.includes('realpathSync.native')],['ir-editor-session',typeof irSession.startIrEditorSession==='function'],['ir-lifecycle',typeof irLifecycle.applyObjectLifecycleOperation==='function'],['ir-page-lifecycle',typeof irPageLifecycle.applyPageLifecycleOperation==='function'],['document-ingest',brief.deckVariantCount===2&&brief.sections.length===1&&typeof pdfText.extractPdfLayout==='function'&&typeof pdfText.extractPdfText==='function'],['prompt-compose',typeof prompt.promptToPresentation==='function'&&typeof prompt.promptToPresentationAsync==='function'&&typeof prompt.persistPromptPlan==='function'&&typeof prompt.persistPromptPlanAsync==='function'&&typeof prompt.validateGenerationManifest==='function'],['content-provider',typeof contentProvider.ContentProviderError==='function'&&contentProvider.MAX_PROVIDER_REQUEST_BYTES===262144&&typeof contentProvider.ContentProviderRegistry==='function'&&typeof contentProvider.createHttpsJsonContentProvider==='function'&&typeof contentProviderConfig.loadContentProviderConfig==='function'&&providerConfigSource.includes('realpathSync.native')],['semantic-depth',roadmap.component==='roadmap'&&gantt.component==='gantt'&&JSON.stringify(roadmap.nodes)!==JSON.stringify(gantt.nodes)],['template-safety',generatedTemplateRejected&&typeof template.inspectTemplate==='function'&&typeof template.applyTemplateLayoutMap==='function'],['deck-variants',deckVariants.length===2&&variantRecords.length===2],['citations-notes',notes.includes('Explain the verified point.')&&notes.includes('https://example.com/source')],['team-worker',typeof worker.createPptCreateHandler==='function'],['team-archive',typeof teamArchive.createPptCreateArchive==='function'&&typeof teamArchive.admitPptCreateArchive==='function'],['spec-schema',schema.properties&&schema.properties.deckVariantCount&&schema.properties.template&&schema.$defs&&schema.$defs.citation&&schema.$defs.slide.properties.speakerNotes],['brief-schema',briefSchema.properties&&briefSchema.properties.deckVariantCount],['openxml-template',admission.includes('ValidateTemplate')&&packageWriter.includes('ResolvePageLayout')],['openxml-notes',notesWriter.includes('class SpeakerNotesWriter')&&packageWriter.includes('SpeakerNotesWriter.Add')],['marketplace-skill',skill.includes('ppt edit-session')&&skill.includes('loopback-editor-session-bound')&&skill.includes('semantic-table-data-editable')&&skill.includes('semantic-chart-data-editable')&&skill.includes('ppt draft')&&skill.includes('ppt compose')&&skill.includes('--provider-config')&&skill.includes('document-visual-structure-preserved')&&skill.includes('template-semantic-layout-mapped')&&skill.includes('complex-graphic-native-gate')&&skill.includes('ir-batch-style-validated')&&skill.includes('ir-object-lifecycle-validated')&&skill.includes('ir-page-lifecycle-validated')&&skill.includes('ppt archive')&&skill.includes('ppt apply-ir-edit')&&skill.includes('ppt finalize-ir-edit')&&skill.includes('ppt export-ir')&&skill.includes('edit-finalization-report.json')&&skill.includes('CONTENT_PROVIDER_*')&&skill.includes('deck.variants.json')&&skill.includes('asset-manifest.json')&&skill.includes('generation-manifest.json')&&skill.includes('asset-license-policy-compliant')&&skill.includes('template-layout-capacity-respected')]];",
    "const failed=checks.find((entry)=>!entry[1]);if(failed){process.stdout.write(failed[0]);process.exit(2);}process.stdout.write('ready');",
    "}catch{process.stdout.write(stage);process.exit(2);}"
  ].join("");
}

function verifyInstalledCli({ installRoot, commandRunner, expectedPackageFolders }) {
  const cli = installedCliPath(installRoot);
  const packageRoot = path.join(installRoot, "node_modules", "common-tools");
  const packageNames = verifyInstalledPackageSurfaces(packageRoot, expectedPackageFolders);
  verifyRuntimeDependencyClosure(packageRoot, packageNames, path.join(installRoot, "node_modules"));
  const help = run(commandRunner, process.execPath, [cli, "help"], installRoot, "installed runtime CLI help check failed");
  if (!help.includes("usage: common-tools <command>")) throw new Error("installed runtime CLI help is invalid");
  const listed = run(commandRunner, process.execPath, [cli, "plugin", "list"], installRoot, "installed runtime plugin check failed");
  let catalog;
  try { catalog = JSON.parse(listed); } catch { throw new Error("installed runtime plugin output is invalid"); }
  if (!plainObject(catalog) || catalog.distributionVerified !== true || !Array.isArray(catalog.capabilities) || catalog.capabilities.length === 0) throw new Error("installed runtime plugin output is invalid");
  const acceptancePlan = run(commandRunner, process.execPath, [cli, "team", "production-acceptance-plan"], installRoot, "installed production acceptance plan check failed");
  let parsedAcceptancePlan;
  try { parsedAcceptancePlan = JSON.parse(acceptancePlan); } catch { throw new Error("installed production acceptance plan output is invalid"); }
  if (!plainObject(parsedAcceptancePlan) || !["blocked-by-configuration", "ready-for-production-preflight"].includes(parsedAcceptancePlan.status) || !plainObject(parsedAcceptancePlan.requiredConfiguration)) {
    throw new Error("installed production acceptance plan output is invalid");
  }
  const envFileRejection = commandRunner(process.execPath, [cli, "team", "migration-status", "--production-env-file", "production.env"], { cwd: installRoot, encoding: "utf8", windowsHide: true, maxBuffer: MAX_COMMAND_OUTPUT_BYTES });
  const envFileDiagnostic = `${envFileRejection.stdout || ""}${envFileRejection.stderr || ""}`;
  if (envFileRejection.status !== 1 || !envFileDiagnostic.includes("--production-env-file must be an absolute path")) {
    throw new Error("installed production env file argument check failed");
  }
  const probe = "const path=require('node:path');const root=path.resolve(process.argv[1]);const api=require(path.join(root,'packages','cli','slideclone-runner.js'));const result=api.inspectBundledSlideclone({repositoryRoot:root});if(!result.available)process.exit(2);process.stdout.write('ready');";
  const imageEngine = run(commandRunner, process.execPath, ["-e", probe, packageRoot], installRoot, "installed image-to-editable engine check failed");
  if (imageEngine !== "ready") throw new Error("installed image-to-editable engine check failed");
  const remoteWorker = path.join(packageRoot, "packages", "remote-mcp-server", "bin", "common-tools-team-image-worker.js");
  run(commandRunner, process.execPath, ["--check", remoteWorker], installRoot, "installed image-to-editable remote worker syntax check failed");
  runClassifiedProbe(commandRunner, ["-e", sceneWorkerConsumerProbe(), packageRoot], installRoot, "installed image-to-editable Worker consumer check failed");
  runClassifiedProbe(commandRunner, ["-e", sceneProgramConsumerProbe(), packageRoot], installRoot, "installed image-to-editable program consumer check failed");
  runClassifiedProbe(commandRunner, ["-e", sceneSharedRouteConsumerProbe(), packageRoot], installRoot, "installed image-to-editable shared route consumer check failed", "shared-route");
  runClassifiedProbe(commandRunner, ["-e", approvedBackdropConsumerProbe(), packageRoot], installRoot, "installed image-to-editable approved backdrop consumer check failed");
  runClassifiedProbe(commandRunner, ["-e", imageEditableEnhancementProbe(), packageRoot], installRoot, "installed image-to-editable residual deduplication check failed");
  runClassifiedProbe(commandRunner, ["-e", pptCreateLayoutProbe(), packageRoot], installRoot, "installed ppt-create layout candidate check failed");
  runClassifiedProbe(commandRunner, ["-e", pptCreateEnhancementProbe(), packageRoot], installRoot, "installed ppt-create enhancement check failed");
  return Object.freeze({ capabilityCount: catalog.capabilities.length, packageCount: packageNames.length, imageToEditableEngine: true, sceneWorkerConsumer: true, productionDependencyClosure: true, productionAcceptancePlan: true, residualDeduplication: true, rawImageBatch: true, pptCreateLayoutCandidates: true, pptCreatePlanning: true, pptCreateEnhancements: true });
}

function verifyRuntimePackage({ repositoryRoot = path.resolve(__dirname, ".."), commandRunner = childProcess.spawnSync, temporaryDirectory = fs.mkdtempSync } = {}) {
  if (typeof commandRunner !== "function" || typeof temporaryDirectory !== "function") throw new TypeError("runtime package verifier options are invalid");
  const root = normalDirectory(repositoryRoot, "repository root");
  verifyRuntimeDependencyClosure(root, runtimePackageFolders(root));
  const temporaryRoot = temporaryDirectory(path.join(os.tmpdir(), "common-tools-runtime-package-"));
  let cleanable = false;
  try {
    const temporaryDetails = fs.lstatSync(temporaryRoot);
    if (!temporaryDetails.isDirectory() || temporaryDetails.isSymbolicLink()) throw new Error("runtime package temporary directory is invalid");
    cleanable = true;
    const packInvocation = npmInvocation(["pack", "--json", "--pack-destination", temporaryRoot]);
    const packed = parsePackMetadata(run(commandRunner, packInvocation.command, packInvocation.arguments, root, "runtime package build failed", "package-build"));
    const tarball = path.join(temporaryRoot, packed.filename);
    const tarballDetails = fs.lstatSync(tarball);
    if (!tarballDetails.isFile() || tarballDetails.isSymbolicLink() || tarballDetails.size !== packed.size) throw new Error("runtime package archive is invalid");
    const installRoot = path.join(temporaryRoot, "install");
    fs.mkdirSync(installRoot, { recursive: true, mode: 0o700 });
    const installInvocation = npmInvocation(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installRoot, runtimePackageFileSpec(packed.name, tarball)]);
    run(commandRunner, installInvocation.command, installInvocation.arguments, root, "runtime package installation failed", "package-install");
    const installed = verifyInstalledCli({ installRoot, commandRunner, expectedPackageFolders: runtimePackageFolders(root) });
    return Object.freeze({ packedBytes: packed.size, fileCount: packed.files.length, capabilityCount: installed.capabilityCount, packageCount: installed.packageCount, imageToEditableEngine: installed.imageToEditableEngine, sceneWorkerConsumer: installed.sceneWorkerConsumer, productionDependencyClosure: installed.productionDependencyClosure, productionAcceptancePlan: installed.productionAcceptancePlan, residualDeduplication: installed.residualDeduplication, rawImageBatch: installed.rawImageBatch, pptCreateLayoutCandidates: installed.pptCreateLayoutCandidates, pptCreatePlanning: installed.pptCreatePlanning, pptCreateEnhancements: installed.pptCreateEnhancements });
  } finally {
    if (cleanable) fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

if (require.main === module) {
  const result = verifyRuntimePackage();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

module.exports = { FORBIDDEN_PREFIXES, IMAGE_EDITABLE_RELEASE_FILES, MAX_PACKAGE_BYTES, PPT_CREATE_RELEASE_FILES, REQUIRED_FILES, collectPackageSurfaceTargets, imageEditableEnhancementProbe, installedCliPath, npmCliPath, npmInvocation, parsePackMetadata, pptCreateEnhancementProbe, pptCreateLayoutProbe, runClassifiedProbe, runtimePackageFolders, verifyInstalledCli, verifyInstalledPackageSurfaces, verifyRuntimePackage };
