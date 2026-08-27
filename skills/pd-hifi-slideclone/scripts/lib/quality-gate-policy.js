"use strict";

const { POLICIES: RECONSTRUCTION_BUDGET_POLICIES } = require("./reconstruction-quality-budget");
const { DEFAULT_OCR_ADAPTER, readPaddleOcrConfig, readUmiOcrConfig } = require("./ocr-provider-config");

function readReconstructionBudgetConfig(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("quality gate arguments must be an object");
  const config = {
    required: strictBooleanArg(args["fail-on-reconstruction-budget"], true, "fail-on-reconstruction-budget")
  };
  const policy = args["reconstruction-budget-policy"];
  if (policy !== undefined) {
    if (!RECONSTRUCTION_BUDGET_POLICIES.has(policy)) {
      throw new TypeError(`reconstruction-budget-policy must be one of: ${[...RECONSTRUCTION_BUDGET_POLICIES].join(", ")}`);
    }
    config.policy = policy;
  }
  assignOptionalRatio(config, "maxResidualAreaRatio", args["max-reconstruction-residual-area-ratio"]);
  assignOptionalRatio(config, "maxLargestResidualAreaRatio", args["max-reconstruction-largest-residual-area-ratio"]);
  assignOptionalInteger(config, "minNativeObjectCount", args["min-reconstruction-native-objects"], 0, 100000);
  return Object.freeze(config);
}

function summarizeQualityGateStatus({
  summary = {},
  editabilityProfile = {},
  layerProfile = {},
  componentTemplateCropStatus = {},
  visualUnitDecisionProfile = {},
  nativeObjectConflictProfile = {},
  pptxTextLayerAudit = {},
  reconstructionContract = {},
  reconstructionBudget = {},
  sourceMediaExclusion = {},
  requireNoTextOverlayRisk = false,
  requireNoResidualLayerCandidates = false,
  requireNoRetainedComponentTemplateCrops = false,
  requireNoActionableRetainedComponentTemplateCrops = false,
  requireNoActionableUnexplainedCrops = false,
  requireNoNativeObjectConflicts = false,
  requireNoDuplicatePptxText = false,
  requireReconstructionContract = false,
  requireReconstructionBudget = false,
  requireNoSourceMedia = false,
  requireCompareThresholds = false,
  comparePassed = true
} = {}) {
  const failures = [];
  if (Number(summary.rejected || 0) > 0) failures.push("rejected-pages");
  if (requireNoTextOverlayRisk && Number(editabilityProfile.textOverlayRiskBoxes || 0) > 0) failures.push("text-overlay-risk");
  if (requireNoTextOverlayRisk && Number(editabilityProfile.nativeOverlayRiskShapes || 0) > 0) failures.push("native-overlay-risk");
  const residualLayerCandidates = Number(layerProfile?.totals?.residualCandidates || 0);
  if (requireNoResidualLayerCandidates && residualLayerCandidates > 0) failures.push("residual-layer-candidates");
  const retainedComponentTemplateCrops = Number(componentTemplateCropStatus.retainedImages || 0);
  if (requireNoRetainedComponentTemplateCrops && retainedComponentTemplateCrops > 0) failures.push("component-template-retained-crops");
  const actionableRetainedComponentTemplateCrops = Number(componentTemplateCropStatus.actionableRetainedImages || 0);
  if (requireNoActionableRetainedComponentTemplateCrops && actionableRetainedComponentTemplateCrops > 0) failures.push("actionable-component-template-retained-crops");
  const actionableUnexplainedCrops = Number(visualUnitDecisionProfile.actionableUnexplainedCrops || 0);
  if (requireNoActionableUnexplainedCrops && actionableUnexplainedCrops > 0) failures.push("actionable-unexplained-crops");
  const nativeObjectConflicts = Number(nativeObjectConflictProfile.unresolvedConflictCount || 0);
  if (requireNoNativeObjectConflicts && nativeObjectConflicts > 0) failures.push("native-object-conflicts");
  const duplicatePptxTextShapes = Number(pptxTextLayerAudit.duplicateTextShapeCount || 0);
  if (requireNoDuplicatePptxText && duplicatePptxTextShapes > 0) failures.push("duplicate-pptx-text");
  if (requireReconstructionContract && reconstructionContract.ok === false) failures.push("reconstruction-contract");
  if (requireReconstructionBudget && reconstructionBudget.passed !== true) failures.push("reconstruction-budget");
  if (requireNoSourceMedia && sourceMediaExclusion.passed !== true) failures.push("source-media-exclusion");
  if (requireCompareThresholds && comparePassed === false) failures.push("required-thresholds");
  return Object.freeze({
    passed: failures.length === 0,
    failures: Object.freeze(failures),
    requireNoTextOverlayRisk,
    requireNoResidualLayerCandidates,
    requireNoRetainedComponentTemplateCrops,
    requireNoActionableRetainedComponentTemplateCrops,
    requireNoActionableUnexplainedCrops,
    requireNoNativeObjectConflicts,
    requireNoDuplicatePptxText,
    requireReconstructionContract,
    requireReconstructionBudget,
    requireNoSourceMedia,
    requireCompareThresholds,
    comparePassed,
    textOverlayRiskBoxes: Number(editabilityProfile.textOverlayRiskBoxes || 0),
    textOverlayRiskImages: Number(editabilityProfile.textOverlayRiskImages || 0),
    nativeOverlayRiskShapes: Number(editabilityProfile.nativeOverlayRiskShapes || 0),
    nativeOverlayRiskImages: Number(editabilityProfile.nativeOverlayRiskImages || 0),
    residualLayerCandidates,
    retainedComponentTemplateCrops,
    actionableRetainedComponentTemplateCrops,
    actionableUnexplainedCrops,
    nativeObjectConflicts,
    duplicatePptxTextShapes,
    reconstructionContractErrors: Array.isArray(reconstructionContract.errors) ? reconstructionContract.errors.length : 0,
    reconstructionBudgetFailedPages: Number(reconstructionBudget.failedPageCount || 0),
    reconstructionBudgetMaxResidualAreaRatio: Number(reconstructionBudget.maxResidualAreaRatio || 0),
    reconstructionBudgetMaxLargestResidualAreaRatio: Number(reconstructionBudget.maxLargestResidualAreaRatio || 0),
    sourceMediaExclusionStatus: sourceMediaExclusion.status || "not-run",
    disallowedSourceMediaMatches: Number(sourceMediaExclusion.disallowedMatches || 0),
    duplicateNativeTextPairs: Number(nativeObjectConflictProfile.duplicateTextPairCount || 0),
    unresolvedNativeOwnershipConflicts: Number(nativeObjectConflictProfile.unresolvedOwnershipConflictCount || 0),
    resolvedNativeOwnershipDrops: Number(nativeObjectConflictProfile.resolvedDroppedShapeCount || 0)
      + Number(nativeObjectConflictProfile.resolvedDroppedTextBoxCount || 0)
  });
}

function strictBooleanArg(value, fallback, label) {
  if (value === undefined) return fallback;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  throw new TypeError(`${label} must be true or false`);
}

function assignOptionalRatio(target, key, value) {
  if (value === undefined) return;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${key} must be between 0 and 1`);
  target[key] = number;
}

function assignOptionalInteger(target, key, value, minimum, maximum) {
  if (value === undefined) return;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new TypeError(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  target[key] = number;
}

function consumePaddleOcrBrokerEnvironment(environment = {}) {
  const brokerUrl = environment.SLIDECLONE_PADDLE_OCR_BROKER_URL;
  const brokerToken = environment.SLIDECLONE_PADDLE_OCR_BROKER_TOKEN;
  delete environment.SLIDECLONE_PADDLE_OCR_BROKER_URL;
  delete environment.SLIDECLONE_PADDLE_OCR_BROKER_TOKEN;
  return brokerUrl || brokerToken ? { brokerUrl, brokerToken } : {};
}

module.exports = {
  DEFAULT_OCR_ADAPTER,
  consumePaddleOcrBrokerEnvironment,
  readPaddleOcrConfig,
  readReconstructionBudgetConfig,
  readUmiOcrConfig,
  summarizeQualityGateStatus
};
