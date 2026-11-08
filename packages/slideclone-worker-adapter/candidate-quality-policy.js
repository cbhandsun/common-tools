"use strict";

const { auditNativeComponentQuality, largeRasterEditability, qualityRendered, visualQualityDoesNotRegress } = require("../slideclone-core/team-native-rebuild");
const { auditWorkerSemanticEditability: auditSemanticEditability } = require("./worker-relationship-policy");

function visualFidelityPassed(quality) {
  return Array.isArray(quality?.checks) && quality.checks.some((check) => check?.name === "visual-fidelity" && check.passed === true);
}

function runAudit(audit, value) {
  try {
    return audit(value);
  } catch (error) {
    return Object.freeze({
      passed: false,
      error: error instanceof Error ? error.message : "audit failed"
    });
  }
}

function assessStrictNativeCandidate({ baselineQuality, candidateQuality, candidateDeck, baselineDeck }, assessRasterRemoval) {
  const reasons = [];
  if (!qualityRendered(candidateQuality)) reasons.push("quality-not-rendered");
  if (!visualFidelityPassed(candidateQuality)) reasons.push("visual-fidelity");
  if (!visualQualityDoesNotRegress({ baselineQuality, candidateQuality })
    && !(baselineDeck !== undefined && typeof assessRasterRemoval === "function"
      && assessRasterRemoval({ baselineQuality, candidateQuality, baselineDeck, candidateDeck }) === true)) reasons.push("visual-regressed");
  const raster = largeRasterEditability(candidateDeck);
  if (!raster.passed) reasons.push("large-raster");
  const nativeComponent = runAudit(auditNativeComponentQuality, candidateDeck);
  if (!nativeComponent.passed) reasons.push("native-component-quality");
  const semantic = runAudit(auditSemanticEditability, candidateDeck);
  if (!semantic.passed) reasons.push("semantic-editability");
  return Object.freeze({
    passed: reasons.length === 0,
    reasons: Object.freeze(reasons),
    raster,
    nativeComponent,
    semantic
  });
}

function createStrictNativeCandidatePolicy({ recordDecision, assessRasterRemoval }) {
  if (typeof recordDecision !== "function") throw new TypeError("native candidate decision recorder is invalid");
  if (assessRasterRemoval !== undefined && typeof assessRasterRemoval !== "function") throw new TypeError("native raster removal policy is invalid");
  return input => {
    const decision = assessStrictNativeCandidate(input, assessRasterRemoval);
    recordDecision({ baselineQuality: input.baselineQuality, candidateQuality: input.candidateQuality,
      accepted: decision.passed, sharedRegression: 0, policy: "strict-native", policyReasons: decision.reasons });
    return decision;
  };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} baseline @param {unknown} candidate */
function hasMeasuredVisualGain(baseline, candidate) {
  if (!record(baseline) || !record(candidate) || !record(baseline.metrics) || !record(candidate.metrics)) return false;
  /** @type {Array<[string, number]>} */
  const fields = [["pixel-diff-ratio", 1], ["foreground-missing-ratio", 1], ["mean-absolute-delta", 255]];
  let improved = false;
  for (const [name, limit] of fields) {
    const before = baseline.metrics[name], after = candidate.metrics[name];
    if (typeof before !== "number" || typeof after !== "number" || !Number.isFinite(before) || !Number.isFinite(after)
      || before < 0 || after < 0 || before > limit || after > limit) return false;
    if (after < before - 1e-9) improved = true;
  }
  return improved;
}

const FINAL_REFINEMENT_STRICT_METRICS = Object.freeze(["pixel-diff-ratio", "foreground-missing-ratio", "mean-absolute-delta"]);

function createFinalRefinementQualityPolicy({ sharedWorstComponentRegression, recordDecision }) {
function assessFinalRefinementQuality({ baselineQuality, candidateQuality }) {
  if (baselineQuality?.passed === true && candidateQuality?.passed !== true) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  if (visualQualityDoesNotRegress({ baselineQuality, candidateQuality })) return true;
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  let improved = false;
  let pixelRegressed = false;
  let meanRegressed = false;
  for (const name of FINAL_REFINEMENT_STRICT_METRICS) {
    const before = baselineQuality.metrics?.[name];
    const after = candidateQuality.metrics?.[name];
    if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
    if (after > before + 1e-9) {
      if (name === "pixel-diff-ratio") pixelRegressed = true;
      else if (name === "mean-absolute-delta") meanRegressed = true;
      else return false;
    }
    if (after < before - 1e-9) improved = true;
  }
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention + 4) return false;
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity > beforeSeverity + 0.05) return false;
  if (improved && !pixelRegressed && !meanRegressed) return true;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  if (!Number.isFinite(beforePixel) || !Number.isFinite(afterPixel)) return false;
  if (!Number.isFinite(beforeForeground) || !Number.isFinite(afterForeground)) return false;
  if (!Number.isFinite(beforeMean) || !Number.isFinite(afterMean)) return false;
  if (afterPixel <= beforePixel + 0.000005
    && afterForeground <= beforeForeground + 1e-9
    && afterMean <= beforeMean + 1e-9
    && Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity <= beforeSeverity + 1e-9
    && Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention < beforeAttention) return true;
  if (afterPixel <= beforePixel + 0.0002
    && afterForeground < beforeForeground - 0.0002
    && afterMean <= beforeMean + 1e-9
    && Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity < beforeSeverity - 0.75
    && (!Number.isFinite(beforeAttention) || !Number.isFinite(afterAttention) || afterAttention <= beforeAttention)) return true;
  if (afterPixel > beforePixel + 0.00005) return false;
  if (!pixelRegressed && meanRegressed
    && afterMean <= beforeMean + 0.0001
    && afterPixel < beforePixel - 0.000001
    && afterForeground < beforeForeground - 0.00002
    && Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity <= beforeSeverity + 1e-9
    && Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention < beforeAttention) return true;
  if (afterPixel <= beforePixel + 0.000005
    && afterForeground < beforeForeground - 0.00002
    && afterMean < beforeMean - 0.002
    && afterSeverity <= beforeSeverity + 1e-9
    && (!Number.isFinite(beforeAttention) || !Number.isFinite(afterAttention) || afterAttention <= beforeAttention)) return true;
  if (afterForeground > beforeForeground - 0.0002) return false;
  if (afterMean > beforeMean + 1e-9) return false;
  if (!Number.isFinite(beforeSeverity) || !Number.isFinite(afterSeverity) || afterSeverity > beforeSeverity - 0.2) return false;
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention) return false;
  return true;
}
return ({ baselineQuality, candidateQuality }) => {
 const accepted = assessFinalRefinementQuality({ baselineQuality, candidateQuality });
 recordDecision({ baselineQuality, candidateQuality, accepted, sharedRegression: sharedWorstComponentRegression({ baselineQuality, candidateQuality }), policy: "final-refinement" });
 return accepted;
};
}

function createOcrRecoverySelection({ assess, recordDecision }) {
  return input => {
    const decision = assess(input);
    recordDecision({ baselineQuality: input.baselineQuality, candidateQuality: input.candidateQuality,
      accepted: decision.passed, sharedRegression: 0, policy: "ocr-recovery", policyReasons: decision.reasons });
    return decision.passed;
  };
}
module.exports = { assessStrictNativeCandidate, createStrictNativeCandidatePolicy, hasMeasuredVisualGain, createFinalRefinementQualityPolicy, createOcrRecoverySelection };

