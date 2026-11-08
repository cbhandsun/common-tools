// @ts-check
"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { types } = require("node:util");
/** @typedef {Record<string, unknown>} Item */
/** @param {unknown} value @returns {value is Item} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {Item} baseline @param {Item} metrics */
function annotate(baseline, metrics) {
  if (!record(baseline.quality)) return;
  baseline.quality.metrics = { ...(record(baseline.quality.metrics) ? baseline.quality.metrics : {}), ...metrics };
}
/** @param {Item} quality */
function measuredMetrics(quality) {
  const input = record(quality.metrics) ? quality.metrics : {};
  /** @type {Item} */ const result = {};
  for (const name of ["pixel-diff-ratio", "foreground-missing-ratio", "mean-absolute-delta"]) {
    const value = input[name];
    if (typeof value === "number" && Number.isFinite(value)) result[`native-only-pictorial-icons-candidate-${name}`] = value;
  }
  return result;
}
/** @typedef {{replace:(deck:unknown,root:string)=>unknown, validateDeck:(deck:unknown,root:string)=>unknown,
 * semanticChecksPass:(deck:unknown)=>boolean, doesNotRegress:(input:unknown)=>boolean,
 * raster:(deck:unknown)=>unknown}} Dependencies */
/** A single shadow candidate can replace a passed baseline only after the same
 * quality gates pass. Failure/cancellation removes only this transaction's files.
 * @param {Dependencies} dependencies */
function createPictorialCandidateBuilder(dependencies) {
  if (!record(dependencies) || ![dependencies.replace, dependencies.validateDeck, dependencies.semanticChecksPass,
    dependencies.doesNotRegress, dependencies.raster].every(value => typeof value === "function")) {
    throw new TypeError("pictorial candidate dependencies are invalid");
  }
  const { replace, validateDeck, semanticChecksPass, doesNotRegress, raster } = dependencies;
  return async (/** @type {unknown} */ input) => {
    if (!record(input) || !record(input.baseline) || !record(input.baseline.deck) || !record(input.baseline.quality)
      || typeof input.root !== "string" || !path.isAbsolute(input.root) || input.root.includes("\0") || input.root.length > 32768
      || typeof input.runBuild !== "function" || typeof input.rawImageQualityVerifier !== "function"
      || typeof input.isCancellationRequested !== "function" || !Array.isArray(input.sourceImages)
      || input.sourceImages.length < 1 || input.sourceImages.length > 20
      || !input.sourceImages.every(file => typeof file === "string" && path.isAbsolute(file) && !file.includes("\0"))) {
      throw new TypeError("pictorial candidate request is invalid");
    }
    const root = input.root, baseline = input.baseline, baselineQuality = input.baseline.quality, realRoot = fs.realpathSync(root);
    if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink()) throw new TypeError("pictorial candidate root is invalid");
    const replacement = replace(baseline.deck, root);
    if (replacement === null) return null;
    if (!record(replacement) || !record(replacement.deck) || typeof replacement.vectorizedImages !== "number"
      || !Number.isSafeInteger(replacement.vectorizedImages) || replacement.vectorizedImages < 1 || replacement.vectorizedImages > 5000
      || typeof replacement.nativeShapes !== "number" || !Number.isSafeInteger(replacement.nativeShapes)
      || replacement.nativeShapes < replacement.vectorizedImages || replacement.nativeShapes > 10000) {
      throw new TypeError("pictorial replacement is invalid");
    }
    const cancelled = /** @type {()=>unknown|Promise<unknown>} */ (input.isCancellationRequested);
    const runBuild = /** @type {(input:unknown)=>Promise<unknown>} */ (input.runBuild);
    const verify = /** @type {(input:unknown)=>Promise<unknown>} */ (input.rawImageQualityVerifier);
    const assertActive = async () => {
      const state = await cancelled();
      if (typeof state !== "boolean") throw new TypeError("pictorial cancellation state is invalid");
      if (state) throw new Error("editable job was cancelled");
    };
    annotate(baseline, { "native-only-pictorial-icons-attempted": 1,
      "native-only-pictorial-icons-vectorized": replacement.vectorizedImages,
      "native-only-pictorial-icons-shapes": replacement.nativeShapes });
    await assertActive();
    const token = crypto.randomUUID(), deckFile = path.join(root, `native-only-pictorial-icons-${token}.deck.json`),
      pptxFile = path.join(root, `native-only-pictorial-icons-${token}.pptx`);
    let accepted = false;
    /** @type {unknown} */ let failure;
    try {
      try { validateDeck(replacement.deck, root); } catch {
        annotate(baseline, { "native-only-pictorial-icons-invalid-deck": 1 }); return null;
      }
      const json = JSON.stringify(replacement.deck);
      if (Buffer.byteLength(json) > 32 * 1024 * 1024) throw new RangeError("pictorial candidate deck is too large");
      fs.writeFileSync(deckFile, `${json}\n`, { encoding: "utf8", flag: "wx" });
      await runBuild({ deckFile, pptxFile });
      await assertActive();
      /** @type {string[]} */ const renderedImages = [];
      const quality = await verify({ root, pptxFile, sourceImage: input.sourceImages[0], sourceImages: input.sourceImages,
        deck: replacement.deck, isCancellationRequested: input.isCancellationRequested,
        collectRenderedPages: (/** @type {unknown} */ pages) => {
          if (!Array.isArray(pages) || pages.length > 20 || renderedImages.length + pages.length > 20
            || !pages.every(file => typeof file === "string" && path.isAbsolute(file))) throw new TypeError("pictorial rendered pages are invalid");
          renderedImages.push(...pages);
        } });
      await assertActive();
      if (!record(quality)) throw new TypeError("pictorial quality result is invalid");
      const semantic = semanticChecksPass(replacement.deck), visual = doesNotRegress({ baselineQuality: baseline.quality, candidateQuality: quality }),
        preservesPassedGate = baselineQuality.passed !== true || quality.passed === true;
      if (!semantic || !visual || !preservesPassedGate) {
        annotate(baseline, { "native-only-pictorial-icons-rejected": 1,
          ...(!semantic ? { "native-only-pictorial-icons-semantic-rejected": 1 } : {}),
          ...(!visual ? { "native-only-pictorial-icons-visual-regressed": 1 } : {}),
          ...(!preservesPassedGate ? { "native-only-pictorial-icons-passed-gate-regressed": 1 } : {}), ...measuredMetrics(quality) });
        return null;
      }
      // Verification cache reports are immutable evidence. Candidate annotations
      // belong to a separate result and must not mutate the verifier's report.
      const candidateQuality = { ...quality, metrics: { ...(record(quality.metrics) ? quality.metrics : {}), "native-only-pictorial-icons-accepted": 1,
        "native-only-pictorial-icons-vectorized": replacement.vectorizedImages, "native-only-pictorial-icons-shapes": replacement.nativeShapes } };
      const candidate = { deck: replacement.deck, deckFile, pptxFile, quality: candidateQuality, raster: raster(replacement.deck), renderedImages,
        removed: baseline.removed, nativeResidualPrimitives: baseline.nativeResidualPrimitives || 0 };
      accepted = true; return candidate;
    } catch (error) { failure = error; throw error; }
    finally { if (!accepted) cleanup(); }
    function cleanup() {
      try {
        if (fs.lstatSync(root).isSymbolicLink() || fs.realpathSync(root) !== realRoot) throw new Error("pictorial cleanup root changed");
        fs.rmSync(deckFile, { force: true }); fs.rmSync(pptxFile, { force: true });
      } catch (error) {
        throw new AggregateError(failure === undefined ? [error] : [failure, error], "pictorial candidate cleanup failed", { cause: error });
      }
    }
  };
}
module.exports = { createPictorialCandidateBuilder };
