// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { types } = require("node:util");
const { createOwnedSourceSnapshot } = require("../slideclone-core/owned-source-snapshot");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @param {number} maximum @param {(value:number)=>boolean} valid */
function numbers(value, maximum, valid) {
  if (!Array.isArray(value) || types.isProxy(value) || value.length > maximum) throw new TypeError("native stroke search plans are invalid");
  /** @type {number[]} */ const result = [];
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !("value" in property) || typeof property.value !== "number" || !Number.isFinite(property.value)
      || !valid(property.value) || result.includes(property.value)) throw new TypeError("native stroke search plan is invalid");
    result.push(property.value);
  }
  return result;
}
/** @param {unknown} value */
function fitResult(value) {
  if (!record(value) || !record(value.deck) || typeof value.candidateShapes !== "number" || !Number.isSafeInteger(value.candidateShapes)
    || value.candidateShapes < 0 || value.candidateShapes > 5000 || typeof value.changedShapes !== "number"
    || !Number.isSafeInteger(value.changedShapes) || value.changedShapes < 0 || value.changedShapes > value.candidateShapes) {
    throw new TypeError("native stroke fit is invalid");
  }
  return { deck: value.deck, candidateShapes: value.candidateShapes, changedShapes: value.changedShapes };
}
/** @typedef {{fit:(deck:unknown,options:unknown)=>unknown,priorityIds:(quality:unknown)=>unknown,
 * strokeWidthMultipliers:()=>unknown,candidateLimits:(count:number)=>unknown,validateDeck:(deck:unknown,root:string)=>unknown,
 * qualityAcceptable:(input:unknown)=>unknown,hasMeasuredGain:(before:unknown,after:unknown)=>unknown}} Dependencies */
/** Refine native strokes on shadow artifacts, never on publication metadata.
 * @param {Dependencies} dependencies */
function createNativeOnlyStrokeRefiner(dependencies) {
  if (!record(dependencies) || Object.values(dependencies).some(value => typeof value !== "function")) throw new TypeError("native stroke dependencies are invalid");
  const { fit, priorityIds, strokeWidthMultipliers, candidateLimits, validateDeck, qualityAcceptable, hasMeasuredGain } = dependencies;
  if (![fit, priorityIds, strokeWidthMultipliers, candidateLimits, validateDeck, qualityAcceptable, hasMeasuredGain].every(value => typeof value === "function")) throw new TypeError("native stroke dependencies are missing");
  return async (/** @type {unknown} */ input) => {
    if (!record(input) || !record(input.baseline) || !record(input.baseline.quality) || !record(input.baseline.deck)
      || typeof input.runBuild !== "function" || typeof input.rawImageQualityVerifier !== "function"
      || typeof input.isCancellationRequested !== "function" || typeof input.root !== "string") throw new TypeError("native stroke request is invalid");
    const verifySources = createOwnedSourceSnapshot(input), baseline = input.baseline, root = input.root;
    if (baseline.rejected === true || (record(baseline.quality) && baseline.quality.passed === true)) return baseline;
    const cancelled = /** @type {()=>boolean|Promise<boolean>} */ (input.isCancellationRequested);
    const build = /** @type {(request:unknown)=>Promise<unknown>} */ (input.runBuild);
    const verify = /** @type {(request:unknown)=>Promise<unknown>} */ (input.rawImageQualityVerifier);
    const assertActive = async () => {
      const state = await cancelled();
      if (typeof state !== "boolean") throw new TypeError("native stroke cancellation state is invalid");
      if (state) throw new Error("editable job was cancelled");
    };
    validateDeck(baseline.deck, root);
    const priorities = priorityIds(baseline.quality), all = fitResult(fit(baseline.deck, { priorityIds: priorities }));
    if (!all.candidateShapes) return baseline;
    const multipliers = numbers(strokeWidthMultipliers(), 4, value => value >= 0.45 && value <= 0.92);
    const limits = numbers(candidateLimits(all.candidateShapes), 6, value => Number.isSafeInteger(value) && value > 0 && value <= all.candidateShapes);
    const realRoot = fs.realpathSync(root), owned = new Set();
    /** @type {Record<string,unknown>} */ let best = baseline;
    let completed = false, attempts = 0;
    /** @type {unknown} */ let failure;
    const checkArtifact = (/** @type {string} */ file) => {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 512 * 1024 * 1024) throw new TypeError("native stroke artifact is invalid");
    };
    const cleanupOwned = () => {
      try {
        if (fs.lstatSync(root).isSymbolicLink() || fs.realpathSync(root) !== realRoot) throw new Error("native stroke cleanup root changed");
        for (const file of owned) if (!completed || (file !== best.deckFile && file !== best.pptxFile)) fs.rmSync(file, { force: true });
      } catch (error) { throw new AggregateError(failure === undefined ? [error] : [failure, error], "native stroke cleanup failed", { cause: error }); }
    };
    try {
      for (const strokeWidthMultiplier of multipliers) {
        for (const candidateLimit of limits) {
          await assertActive(); verifySources();
          const fitted = fitResult(fit(baseline.deck, { priorityIds: priorities, strokeWidthMultiplier, candidateLimit }));
          if (!fitted.changedShapes) continue;
          validateDeck(fitted.deck, root);
          const json = JSON.stringify(fitted.deck);
          if (Buffer.byteLength(json) > 32 * 1024 * 1024) throw new RangeError("native stroke deck is too large");
          const token = crypto.randomUUID(), deckFile = path.join(root, `native-only-stroke-${token}.json`), pptxFile = path.join(root, `native-only-stroke-${token}.pptx`);
          fs.writeFileSync(deckFile, json, { encoding: "utf8", flag: "wx" }); owned.add(deckFile);
          fs.closeSync(fs.openSync(pptxFile, "wx")); owned.add(pptxFile);
          await build({ deckFile, pptxFile });
          await assertActive(); verifySources(); checkArtifact(pptxFile);
          /** @type {string[]} */ let renderedImages = [];
          let collected = false;
          const quality = await verify({ root, pptxFile, sourceImages: input.sourceImages, deck: fitted.deck,
            referenceQuality: best.quality, isCancellationRequested: cancelled, collectRenderedPages: (/** @type {unknown} */ pages) => {
              if (collected || !Array.isArray(pages) || pages.length !== /** @type {unknown[]} */ (input.sourceImages).length) throw new TypeError("native stroke renders are invalid");
              collected = true;
              createOwnedSourceSnapshot({ root, sourceImages: pages });
              for (let index = 0; index < pages.length; index++) {
                const property = Object.getOwnPropertyDescriptor(pages, String(index));
                if (!property || !("value" in property) || typeof property.value !== "string") throw new TypeError("native stroke render path is invalid");
                renderedImages.push(property.value);
              }
            } });
          await assertActive(); verifySources(); attempts++;
          if (!record(quality) || typeof quality.passed !== "boolean" || !record(quality.metrics) || !collected) throw new TypeError("native stroke verification is incomplete");
          const gain = hasMeasuredGain(best.quality, quality), acceptable = qualityAcceptable({ baselineQuality: best.quality, candidateQuality: quality, candidateDeck: fitted.deck });
          if (typeof gain !== "boolean" || typeof acceptable !== "boolean") throw new TypeError("native stroke quality decision is invalid");
          if (!gain || !acceptable) continue;
          best = { ...baseline, deck: fitted.deck, deckFile, pptxFile, renderedImages,
            quality: { ...quality, metrics: { ...quality.metrics, "native-only-stroke-refinement-changed": fitted.changedShapes,
              "native-only-stroke-refinement-attempts": attempts } } };
          if (quality.passed === true) break;
        }
        if (record(best.quality) && best.quality.passed === true) break;
      }
      completed = true;
      return best;
    } catch (error) { failure = error; throw error; }
    finally { cleanupOwned(); }
  };
}
module.exports = { createNativeOnlyStrokeRefiner };
