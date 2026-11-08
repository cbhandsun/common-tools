// @ts-check
"use strict";
const { types } = require("node:util");
const { parseOwnedTextHistory, OWNED_TEXT_WINDOW_LIMIT, OWNED_TEXT_WINDOW_TARGET_LIMIT,
  OWNED_TEXT_SEARCH_TARGET_LIMIT } = require("../slideclone-core/owned-text-target-window");
const { createOwnedSourceSnapshot } = require("../slideclone-core/owned-source-snapshot");
/** @typedef {import("../slideclone-core/owned-text-target-window").TargetRevision} TargetRevision */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** Each window uses freshly verified artifacts; history carries identities, never geometry evidence.
 * @param {(input:unknown,history:TargetRevision[],collect:(targets:unknown,statistics?:unknown)=>void)=>Promise<unknown>} refineOnce */
function createProgressiveOwnedTextRefiner(refineOnce) {
  if (typeof refineOnce !== "function") throw new TypeError("owned text window callback is invalid");
  return async (/** @type {unknown} */ input) => {
    if (!record(input)) throw new TypeError("owned text window request is invalid");
    const verifySources = createOwnedSourceSnapshot(input);
    let baseline = input.baseline;
    const totals = { windows: 0, probed: 0, proposed: 0, changed: 0, rolledBack: 0 };
    /** @type {TargetRevision[]} */ let history = parseOwnedTextHistory(record(baseline) ? baseline.ownedTextTargetHistory : undefined);
    for (let window = 0; window < OWNED_TEXT_WINDOW_LIMIT && history.length < OWNED_TEXT_SEARCH_TARGET_LIMIT; window++) {
      /** @type {TargetRevision[]} */ let attempted = [];
      let collected = false;
      verifySources();
      baseline = await refineOnce({ ...input, baseline }, history, (targets, statistics) => {
        if (collected) throw new TypeError("owned text window targets were collected twice");
        collected = true;
        attempted = parseOwnedTextHistory(targets);
        if (attempted.length > OWNED_TEXT_WINDOW_TARGET_LIMIT) throw new RangeError("owned text window exceeds four targets");
        if (attempted.length) { totals.windows++; totals.probed += attempted.length; }
        if (statistics !== undefined) {
          if (!record(statistics) || [statistics.proposed, statistics.changed, statistics.rolledBack].some(value =>
            typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > attempted.length)) {
            throw new TypeError("owned text window statistics are invalid");
          }
          const proposed = /** @type {number} */ (statistics.proposed), changed = /** @type {number} */ (statistics.changed);
          const rolledBack = /** @type {number} */ (statistics.rolledBack);
          if (changed + rolledBack > proposed) throw new TypeError("owned text window statistics are inconsistent");
          totals.proposed += proposed; totals.changed += changed; totals.rolledBack += rolledBack;
        }
      });
      verifySources();
      history = parseOwnedTextHistory([...history, ...attempted]);
      if (attempted.length === 0 || !record(baseline) || (record(baseline.quality) && baseline.quality.passed === true)) break;
    }
    if (!totals.windows || !record(baseline)) return baseline;
    const result = { ...baseline, ownedTextTargetHistory: history };
    if (!record(baseline.quality) || !record(baseline.quality.metrics)) return result;
    return { ...result, quality: { ...baseline.quality, metrics: { ...baseline.quality.metrics,
      "native-only-owned-text-refinement-windows": totals.windows,
      "native-only-owned-text-refinement-probed": totals.probed,
      "native-only-owned-text-refinement-proposed": totals.proposed,
      "native-only-owned-text-refinement-changed": totals.changed,
      "native-only-owned-text-refinement-rolled-back": totals.rolledBack } } };
  };
}
module.exports = { createProgressiveOwnedTextRefiner };
