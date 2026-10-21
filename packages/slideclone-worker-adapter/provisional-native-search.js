// @ts-check
"use strict";
const { types } = require("node:util");
const { createOwnedSourceSnapshot } = require("../slideclone-core/owned-source-snapshot");
const { OWNED_TEXT_SEARCH_PASS_LIMIT, parseOwnedTextHistory } = require("../slideclone-core/owned-text-target-window");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** Only revision identities advance on a no-op; artifact and quality ownership stay with best.
 * @param {Record<string,unknown>} best @param {Record<string,unknown>} next */
function advanceHistory(best, next) {
  const previous = parseOwnedTextHistory(best.ownedTextTargetHistory);
  if (previous.length && next.ownedTextTargetHistory === undefined) throw new TypeError("provisional native history is missing");
  const history = parseOwnedTextHistory(next.ownedTextTargetHistory);
  if (history.length < previous.length || previous.some((entry, index) => {
    const current = history[index];
    return !current || entry.pageIndex !== current.pageIndex || entry.id !== current.id
      || entry.textRevision !== current.textRevision || entry.sourceHash !== current.sourceHash;
  })) throw new TypeError("provisional native history lineage is invalid");
  const advanced = history.length > previous.length;
  return { best: advanced ? { ...best, ownedTextTargetHistory: history } : best, advanced };
}
/** @typedef {{assess:(input:unknown)=>unknown,qualityAcceptable:(input:unknown)=>unknown,hasMeasuredGain:(before:unknown,after:unknown)=>boolean}} Dependencies */
/** Keep native search state separate from publication; final admission remains the caller's strict gate.
 * @param {Dependencies} dependencies */
function createProvisionalNativeSearch({ assess, qualityAcceptable, hasMeasuredGain }) {
  if (typeof assess !== "function" || typeof qualityAcceptable !== "function" || typeof hasMeasuredGain !== "function") throw new TypeError("provisional native search dependencies are invalid");
  return async (/** @type {unknown} */ input) => {
    if (!record(input)) throw new TypeError("provisional native search request is invalid");
    const original = input.candidate;
    if (original === null || original === undefined) return original;
    if (!record(original)) throw new TypeError("provisional native candidate is invalid");
    if (original.rejected === true || (input.refineOwnedTexts === undefined && input.refineNativeStrokes === undefined)) return original;
    if ((input.refineOwnedTexts !== undefined && typeof input.refineOwnedTexts !== "function")
      || (input.refineNativeStrokes !== undefined && typeof input.refineNativeStrokes !== "function")
      || typeof input.isCancellationRequested !== "function") throw new TypeError("provisional native search callbacks are invalid");
    const refine = /** @type {(input:unknown)=>Promise<unknown>} */ (input.refineOwnedTexts);
    const cancelled = /** @type {()=>boolean|Promise<boolean>} */ (input.isCancellationRequested);
    const assertActive = async () => {
      const value = await cancelled();
      if (typeof value !== "boolean") throw new TypeError("provisional native cancellation state is invalid");
      if (value) throw new Error("editable job was cancelled");
    };
    const gained = (/** @type {unknown} */ before, /** @type {unknown} */ after) => {
      const value = hasMeasuredGain(before, after);
      if (typeof value !== "boolean") throw new TypeError("provisional native gain decision is invalid");
      return value;
    };
    const assessCandidate = (/** @type {Record<string,unknown>} */ candidate) => {
      const policy = assess({ baselineQuality: input.baselineQuality, baselineDeck: input.baselineDeck,
        candidateQuality: candidate.quality, candidateDeck: candidate.deck });
      if (!record(policy) || typeof policy.passed !== "boolean" || !Array.isArray(policy.reasons) || types.isProxy(policy.reasons)
        || policy.reasons.length > 8 || Object.values(Object.getOwnPropertyDescriptors(policy.reasons)).some(property => !("value" in property))) throw new TypeError("provisional native assessment is invalid");
      for (let index = 0; index < policy.reasons.length; index++) {
        const property = Object.getOwnPropertyDescriptor(policy.reasons, String(index));
        if (!property || !("value" in property) || typeof property.value !== "string") throw new TypeError("provisional native assessment reason is invalid");
      }
      if (policy.passed && policy.reasons.length) throw new TypeError("provisional native assessment is contradictory");
      // Absolute visual success is not delivery success: the native candidate
      // can still owe a strict regression repair against the original reference.
      // Only visual deficits may be searched. Structural/source failures retain
      // their veto, and the caller still applies the unchanged final strict gate.
      return { passed: policy.passed, searchable: !policy.passed && policy.reasons.length > 0
        && policy.reasons.every(reason => reason === "visual-fidelity" || reason === "visual-regressed"),
        strictRecovery: policy.reasons.includes("visual-regressed") };
    };
    let best = original, policy = assessCandidate(best);
    if (!policy.searchable || !gained(input.baselineQuality, best.quality)) return original;
    const verifySources = createOwnedSourceSnapshot(input);
    for (let stage = 0; typeof input.refineOwnedTexts === "function" && stage < OWNED_TEXT_SEARCH_PASS_LIMIT - 1; stage++) {
      await assertActive();
      verifySources();
      const next = await refine({ root: input.root, baseline: best, sourceImages: input.sourceImages,
        runBuild: input.runBuild, rawImageQualityVerifier: input.rawImageQualityVerifier, isCancellationRequested: cancelled,
        strictRecovery: policy.strictRecovery });
      verifySources();
      await assertActive();
      if (!record(next)) throw new TypeError("provisional native refinement result is invalid");
      const progress = advanceHistory(best, next);
      best = progress.best;
      if (next.rejected === true) break;
      if (!gained(best.quality, next.quality)) {
        if (progress.advanced) continue;
        break;
      }
      const acceptable = qualityAcceptable({ baselineQuality: best.quality, candidateQuality: next.quality, candidateDeck: next.deck });
      if (typeof acceptable !== "boolean") throw new TypeError("provisional native refinement decision is invalid");
      if (!acceptable) {
        if (progress.advanced) continue;
        break;
      }
      const nextPolicy = assessCandidate(next);
      if (!nextPolicy.passed && !nextPolicy.searchable) break;
      best = next; policy = nextPolicy;
      if (policy.passed) break;
    }
    if (!policy.passed && typeof input.refineNativeStrokes === "function") {
      await assertActive(); verifySources();
      const next = await input.refineNativeStrokes({ root: input.root, baseline: best, sourceImages: input.sourceImages,
        runBuild: input.runBuild, rawImageQualityVerifier: input.rawImageQualityVerifier, isCancellationRequested: cancelled });
      await assertActive(); verifySources();
      if (!record(next)) throw new TypeError("provisional native stroke result is invalid");
      const progress = advanceHistory(best, next);
      best = progress.best;
      if (next.rejected !== true && gained(best.quality, next.quality)) {
        const acceptable = qualityAcceptable({ baselineQuality: best.quality, candidateQuality: next.quality, candidateDeck: next.deck });
        if (typeof acceptable !== "boolean") throw new TypeError("provisional native stroke decision is invalid");
        if (acceptable) {
          const nextPolicy = assessCandidate(next);
          if (nextPolicy.passed || nextPolicy.searchable) best = next;
        }
      }
    }
    return best;
  };
}
module.exports = { createProvisionalNativeSearch };
