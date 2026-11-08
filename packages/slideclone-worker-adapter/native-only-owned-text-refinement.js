// @ts-check
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { createProgressiveOwnedTextRefiner } = require("./progressive-owned-text-refinement");

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @typedef {{deck:unknown,pptxFile:string,fixedTextRois:unknown[],candidateDeck:unknown}} VerifyInput */
/** @typedef {{root:string,pptxFile:string,sourceImages:unknown[],deck:unknown,referenceQuality:unknown,isCancellationRequested:()=>boolean|Promise<boolean>,collectRenderedPages:(pages:unknown)=>void}} VerifyRequest */
/** @typedef {{refineOwnedTexts:(input:unknown)=>Promise<unknown>,validateDeck:(deck:unknown,root:string)=>unknown}} Dependencies */
/** @param {unknown} value @param {string} root */
function outputFile(value, root) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError("owned text candidate file is invalid");
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(value));
  const info = fs.lstatSync(value);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || !info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 512 * 1024 * 1024) throw new TypeError("owned text candidate file is invalid");
  return value;
}

/** Keep original text ROIs while auditing the actual candidate's non-text components.
 * @param {unknown} original @param {unknown} candidate */
function fixedTextVerificationDeck(original, candidate) {
  if (!record(original) || !record(candidate) || !Array.isArray(original.pages) || !Array.isArray(candidate.pages)
    || original.pages.length !== candidate.pages.length) throw new TypeError("owned text verification decks are invalid");
  const originals = original.pages;
  return { ...structuredClone(candidate), pages: candidate.pages.map((page, index) => {
    const baselinePage = originals[index];
    if (!record(page) || !record(baselinePage) || !Array.isArray(baselinePage.textBoxes)) {
      throw new TypeError("owned text verification page is invalid");
    }
    return { ...structuredClone(page), textBoxes: structuredClone(baselinePage.textBoxes) };
  }) };
}

/** Bridge owned fitting before native-candidate publication; preserve the original ROI deck in verification.
 * @param {Dependencies} dependencies */
function createNativeOnlyOwnedTextRefiner({ refineOwnedTexts, validateDeck }) {
  if (typeof refineOwnedTexts !== "function" || typeof validateDeck !== "function") throw new TypeError("owned text bridge dependencies are invalid");
  return createProgressiveOwnedTextRefiner(async function refineNativeOnlyOwnedTexts(input, targetHistory, collectTargets) {
    if (!record(input) || typeof input.root !== "string" || !path.isAbsolute(input.root)
      || !Array.isArray(input.sourceImages) || input.sourceImages.length < 1 || input.sourceImages.length > 20
      || typeof input.runBuild !== "function" || typeof input.rawImageQualityVerifier !== "function"
      || typeof input.isCancellationRequested !== "function") throw new TypeError("owned text bridge request is invalid");
    if (input.strictRecovery !== undefined && typeof input.strictRecovery !== "boolean") throw new TypeError("owned text strict recovery control is invalid");
    const baseline = input.baseline;
    if (baseline === null || baseline === undefined) return baseline;
    if (!record(baseline) || !record(baseline.quality)) throw new TypeError("owned text bridge candidate is invalid");
    if (baseline.rejected === true || (baseline.quality.passed === true && input.strictRecovery !== true)) return baseline;
    if (!Array.isArray(baseline.renderedImages) || baseline.renderedImages.length !== input.sourceImages.length) return baseline;
    const root = input.root, sourceImages = input.sourceImages;
    const rawImageQualityVerifier = /** @type {(input:VerifyRequest)=>Promise<unknown>} */ (input.rawImageQualityVerifier);
    const isCancellationRequested = /** @type {()=>boolean|Promise<boolean>} */ (input.isCancellationRequested);
    /** @type {Map<string,string[]>} */ const renders = new Map();
    const result = await refineOwnedTexts({ root, deck: baseline.deck, deckFile: baseline.deckFile, pptxFile: baseline.pptxFile,
      targetHistory, strictRecovery: input.strictRecovery === true,
      sourceImages, renderedImages: baseline.renderedImages, initialQuality: baseline.quality,
      buildCandidate: input.runBuild, isCancellationRequested,
      verifyCandidate: async (/** @type {VerifyInput} */ request) => {
        /** @type {string[]} */ const renderedImages = [];
        const verificationDeck = fixedTextVerificationDeck(request.deck, request.candidateDeck);
        validateDeck(verificationDeck, root);
        const quality = await rawImageQualityVerifier({ root, pptxFile: request.pptxFile, deck: verificationDeck,
          sourceImages, referenceQuality: baseline.quality, isCancellationRequested, collectRenderedPages: pages => {
            if (!Array.isArray(pages) || pages.length !== sourceImages.length || pages.some(file => typeof file !== "string")) {
              throw new TypeError("owned text candidate rendered pages are invalid");
            }
            renderedImages.push(...pages.map(file => outputFile(file, root)));
          } });
        renders.set(request.pptxFile, renderedImages);
        return quality;
      } });
    if (!record(result) || typeof result.accepted !== "boolean" || typeof result.changedTextBoxes !== "number"
      || !Number.isSafeInteger(result.changedTextBoxes) || result.changedTextBoxes < 0 || result.changedTextBoxes > 4) {
      throw new TypeError("owned text candidate result is invalid");
    }
    collectTargets(result.probedTextTargets, result.probedTextTargets === undefined ? undefined : {
      proposed: result.proposedTextBoxes, changed: result.accepted ? result.changedTextBoxes : 0,
      rolledBack: result.rolledBackTextBoxes });
    if (!result.accepted) return baseline;
    validateDeck(result.deck, root);
    const deckFile = outputFile(result.deckFile, root), pptxFile = outputFile(result.pptxFile, root);
    const renderedImages = renders.get(pptxFile);
    if (!record(result.quality) || !record(result.quality.metrics) || !renderedImages || renderedImages.length !== sourceImages.length) {
      throw new TypeError("owned text candidate verification is incomplete");
    }
    return { ...baseline, deck: result.deck, deckFile, pptxFile, renderedImages, quality: { ...result.quality,
      metrics: { ...result.quality.metrics, "native-only-owned-text-refinement-accepted": 1,
        "native-only-owned-text-refinement-last-window-boxes": result.changedTextBoxes,
        "native-only-owned-text-refinement-boxes": result.changedTextBoxes } } };
  });
}
module.exports = { createNativeOnlyOwnedTextRefiner };
