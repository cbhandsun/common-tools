// @ts-check
"use strict";
const path = require("node:path");
const { types } = require("node:util");
const { createNativeOnlyTextWeightRefiner } = require("./native-only-text-weight-refinement");
const { textRefinementAuthoritySnapshot, assertTextRefinementPreservesAuthority, textRefinementAuditFailures } = require("../slideclone-core/text-refinement-preservation");

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @typedef {import('./native-only-text-weight-refinement').Dependencies & {
 * refineGeometry:(request:unknown)=>Promise<unknown>,
 * auditComponents:(deck:unknown)=>{checks:readonly {name:string,passed:boolean}[]}
 * }} Dependencies */

/** Independent text repairs can run on an incomplete scene. Each stage must
 * preserve the captured source/graphic authority and cannot add structural
 * failures. The caller retains its unchanged strict publication audit.
 * @param {Dependencies} dependencies */
function createNativeOnlyTextRefiner(dependencies) {
  if (!record(dependencies) || typeof dependencies.refineGeometry !== "function" || typeof dependencies.auditComponents !== "function")
    throw new TypeError("Invalid native text refinement dependencies");
  const refineWeight = createNativeOnlyTextWeightRefiner(dependencies);
  return async (/** @type {unknown} */ request) => {
    if (!record(request)) throw new TypeError("Invalid native text refinement request");
    const candidate = request.nativeOnlyCandidate;
    if (candidate === null || candidate === undefined) return candidate;
    if (!record(candidate)) throw new TypeError("Invalid native text refinement candidate");
    if (candidate.rejected === true) return candidate;
    if (!record(candidate.deck) || !record(candidate.quality)
      || typeof request.root !== "string" || !path.isAbsolute(request.root)
      || typeof request.isCancellationRequested !== "function"
      || typeof request.runBuild !== "function" || typeof request.rawImageQualityVerifier !== "function"
      || request.rawImageTextRefiner !== undefined && typeof request.rawImageTextRefiner !== "function"
      || request.rawImageOwnedTextRefiner !== undefined && typeof request.rawImageOwnedTextRefiner !== "function")
      throw new TypeError("Invalid native text refinement controls");
    const sources = request.sourceImages;
    if (!Array.isArray(sources) || types.isProxy(sources) || Object.getPrototypeOf(sources) !== Array.prototype
      || sources.length < 1 || sources.length > 50 || Reflect.ownKeys(sources).length !== sources.length + 1
      || Object.values(Object.getOwnPropertyDescriptors(sources)).some(property => !("value" in property))
      || sources.some(file => typeof file !== "string" || !path.isAbsolute(file)))
      throw new TypeError("Invalid native text refinement sources");
    const cancelled = await request.isCancellationRequested();
    if (typeof cancelled !== "boolean") throw new TypeError("Invalid native text refinement cancellation");
    if (cancelled) throw new Error("editable job was cancelled");
    dependencies.validateDeck(candidate.deck, request.root);
    if (candidate.quality.metrics !== undefined && !record(candidate.quality.metrics))
      throw new TypeError("Invalid native text refinement metrics");
    const authority = textRefinementAuthoritySnapshot(candidate.deck);
    const originalDeck = candidate.deck, root = request.root;
    const failures = textRefinementAuditFailures(dependencies.auditComponents(candidate.deck));
    /** @param {unknown} result */
    function checked(result) {
      if (!record(result) || !record(result.deck)) throw new TypeError("Invalid native text refinement result");
      dependencies.validateDeck(result.deck, root);
      assertTextRefinementPreservesAuthority(authority, result.deck);
      // Also detect a provider mutating the input in place while returning a copy.
      assertTextRefinementPreservesAuthority(authority, originalDeck);
      const next = textRefinementAuditFailures(dependencies.auditComponents(result.deck));
      if ([...next].some(([name,count]) => count > (failures.get(name) ?? 0)))
        throw new TypeError("Native text refinement regressed structural checks");
      return result;
    }
    const geometry = await dependencies.refineGeometry(request);
    assertTextRefinementPreservesAuthority(authority, originalDeck);
    if (geometry === null || geometry === undefined) return geometry;
    if (!record(geometry)) throw new TypeError("Invalid native text geometry result");
    if (geometry.rejected === true) return geometry;
    checked(geometry);
    const weighted = await refineWeight({ root: request.root, baseline: geometry, sourceImages: sources,
      runBuild: request.runBuild, rawImageQualityVerifier: request.rawImageQualityVerifier,
      isCancellationRequested: request.isCancellationRequested });
    const baseline = weighted || geometry;
    checked(baseline);
    return typeof request.rawImageOwnedTextRefiner === "function"
      ? checked(await request.rawImageOwnedTextRefiner({ ...request, baseline })) : baseline;
  };
}
module.exports = { createNativeOnlyTextRefiner };
