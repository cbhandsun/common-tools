"use strict";

const { largeRasterEditability, nativeObjectMetrics, qualityRendered, auditNativeComponentQuality, assessOcrRecovery, visualQualityDoesNotRegress, tileLargeReconstructionRasters, writeTextErasedVisualFallbackAsset, ocrRecoveryCandidateScopes, shouldStopOcrRecoverySearch } = require("../slideclone-core/team-native-rebuild");
const { WorkerFailure } = require("../team-runtime/worker-failure");
const { run } = require("../slideclone-core/renderer-process");
const { MAX_ARTIFACT_BYTES, prepareDeliveryArtifacts, readDeliveryArtifact } = require("../artifact-core");
const { auditWorkerSemanticEditability: auditSemanticEditability, withWorkerRelationshipPolicy } = require("./worker-relationship-policy");
const { assertQualityReport } = require("../capability-contracts");
const { QUALITY_GATE_REQUIRED } = require("../team-runtime/worker-completion");

module.exports = { largeRasterEditability, nativeObjectMetrics, qualityRendered, auditNativeComponentQuality, assessOcrRecovery, visualQualityDoesNotRegress, tileLargeReconstructionRasters, writeTextErasedVisualFallbackAsset, ocrRecoveryCandidateScopes, shouldStopOcrRecoverySearch, WorkerFailure, run, MAX_ARTIFACT_BYTES, prepareDeliveryArtifacts, readDeliveryArtifact, auditSemanticEditability, assertQualityReport, QUALITY_GATE_REQUIRED };
module.exports.withWorkerRelationshipPolicy = withWorkerRelationshipPolicy;
