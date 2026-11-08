"use strict";
// @ts-check
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { planEvidenceTextWeightFit } = require("../slideclone-core/typography/text-weight-evidence");
const { planMeasuredSingleLineTextFit } = require("../slideclone-core/typography/measured-text-fit");
const { rollbackRegressedNativeTexts } = require("./text-candidate-rollback");

/** @typedef {{[key:string]:unknown,slideSize:unknown,pages:Array<{[key:string]:unknown,textBoxes:unknown[]}>}} Deck */
/** @typedef {{[key:string]:unknown,passed?:boolean,textWeightEvidence?:unknown,metrics?:Record<string,unknown>}} Quality */
/** @typedef {{[key:string]:unknown,deck:Deck,quality:Quality,rejected?:boolean}} Baseline */
/** @typedef {{deckFile:string,pptxFile:string}} BuildRequest */
/** @typedef {{root:string,deck:Deck,pptxFile:string,sourceImages:string[],referenceQuality:Quality,isCancellationRequested:()=>Promise<boolean>,collectRenderedPages:(pages:unknown)=>void}} VerifyRequest */
/** @typedef {{root:string,baseline:Baseline,sourceImages:string[],runBuild:(request:BuildRequest)=>Promise<unknown>,rawImageQualityVerifier:(request:VerifyRequest)=>Promise<Quality>,isCancellationRequested:()=>Promise<boolean>}} RefinementRequest */
/** @typedef {{validateDeck:(deck:unknown,root:string)=>unknown,auditSemantic:(deck:unknown)=>{passed:boolean},qualityRendered:(quality:unknown)=>boolean,qualityAcceptable:(request:{baselineQuality:unknown,candidateQuality:unknown})=>boolean,maxPptxBytes:number}} Dependencies */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {Dependencies} dependencies */
function createNativeOnlyTextWeightRefiner({ validateDeck, auditSemantic, qualityRendered, qualityAcceptable, maxPptxBytes }) {
  if (![validateDeck, auditSemantic, qualityRendered, qualityAcceptable].every(fn => typeof fn === "function")
    || !Number.isSafeInteger(maxPptxBytes) || maxPptxBytes < 1) throw new TypeError("Invalid native text weight dependencies");
  return async function refineNativeOnlyTextWeight(/** @type {unknown} */ request) {
    if (!record(request) || !record(request.baseline) || !record(request.baseline.deck)
      || typeof request.root !== "string" || !path.isAbsolute(request.root)
      || !Array.isArray(request.sourceImages) || request.sourceImages.length < 1 || request.sourceImages.length > 50
      || typeof request.runBuild !== "function" || typeof request.rawImageQualityVerifier !== "function"
      || typeof request.isCancellationRequested !== "function") throw new TypeError("Invalid native text weight request");
    const { root, baseline, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested } = /** @type {RefinementRequest} */ (request);
    if (baseline.rejected === true || baseline.quality?.passed === true || !qualityRendered(baseline.quality)) return null;
    validateDeck(baseline.deck, root);
    if (!Array.isArray(baseline.deck.pages) || baseline.deck.pages.length !== sourceImages.length) throw new TypeError("Invalid native text weight pages");
    const realRoot = fs.realpathSync(root);
    for (const file of sourceImages) {
      if (typeof file !== "string" || !path.isAbsolute(file)) throw new TypeError("Invalid native text weight source");
      const info = fs.lstatSync(file), relative = path.relative(realRoot, fs.realpathSync(file));
      if (!info.isFile() || info.isSymbolicLink() || !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new TypeError("Invalid native text weight source");
    }
    const evidence = baseline.quality.textWeightEvidence;
    if (evidence === undefined) return null;
    if (!Array.isArray(evidence) || evidence.length > 20000
      || evidence.some(row => !record(row) || typeof row.pageIndex !== "number" || !Number.isSafeInteger(row.pageIndex) || row.pageIndex < 0 || row.pageIndex >= sourceImages.length))
      throw new TypeError("Invalid native text weight evidence");
    const cancelled = async () => { if (await isCancellationRequested()) throw new Error("editable job was cancelled"); };
    await cancelled();
    let deck = structuredClone(baseline.deck), proposed = 0;
    /** @type {string[][]} */ const pageTargets = [];
    for (const [pageIndex,page] of deck.pages.entries()) {
      const plan = planEvidenceTextWeightFit({ slideSize: deck.slideSize, textBoxes: page.textBoxes,
        evidence: evidence.filter(row => row.pageIndex === pageIndex) });
      page.textBoxes = plan.textBoxes;
      proposed += plan.changedTextBoxes;
      pageTargets.push(plan.targetIds);
    }
    if (proposed < 1) return null;
    validateDeck(deck, root);
    if (!auditSemantic(deck).passed) return null;
    const token = crypto.randomUUID();
    /** @type {string[]} */ const owned = [];
    const deckFile = path.join(root, `native-only-text-weight-${token}.json`);
    const pptxFile = path.join(root, `native-only-text-weight-${token}.pptx`);
    let adopted = false;
    try {
      fs.writeFileSync(deckFile, JSON.stringify(deck), { encoding: "utf8", flag: "wx" }); owned.push(deckFile);
      fs.closeSync(fs.openSync(pptxFile, "wx")); owned.push(pptxFile);
      /** @type {string[]} */ let renderedImages = [];
      const buildAndVerify = async () => {
        await cancelled();
        await runBuild({ deckFile, pptxFile });
        await cancelled();
        const info = fs.lstatSync(pptxFile);
        if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maxPptxBytes) throw new Error("Invalid native text weight artifact");
        renderedImages = [];
        const quality = await rawImageQualityVerifier({ root, deck, pptxFile, sourceImages, referenceQuality: baseline.quality,
          isCancellationRequested, collectRenderedPages: pages => {
            if (!Array.isArray(pages) || pages.length > 50 || pages.some(file => typeof file !== "string" || !path.isAbsolute(file)))
              throw new TypeError("Invalid native text weight rendered pages");
            renderedImages.push(...pages);
          } });
        await cancelled();
        return quality;
      };
      let quality = await buildAndVerify(), rolledBackTextBoxes = 0, geometryChanges = 0;
      if (!qualityRendered(quality)) return null;
      const localWeightRegression = rollbackRegressedNativeTexts({ baselineDeck: baseline.deck, candidateDeck: deck,
        baselineQuality: baseline.quality, candidateQuality: quality, strictMetrics: true }).rolledBackTextBoxes > 0;
      if ((!qualityAcceptable({ baselineQuality: baseline.quality, candidateQuality: quality }) || localWeightRegression)
        && Array.isArray(quality.textWeightEvidence)) {
        // A weight change alters glyph extents; use its actual render before fitting size.
        const measured = structuredClone(deck);
        for (const [pageIndex,page] of measured.pages.entries()) {
          const targetIds = pageTargets[pageIndex] || [];
          if (!targetIds.length) continue;
          const plan = planMeasuredSingleLineTextFit({ slideSize: measured.slideSize, textBoxes: page.textBoxes,
            measurements: quality.textWeightEvidence.filter(row => record(row) && row.pageIndex === pageIndex), targetIds });
          page.textBoxes = plan.textBoxes;
          geometryChanges += plan.changes.length;
        }
        if (geometryChanges > 0) {
          validateDeck(measured, root);
          if (!auditSemantic(measured).passed) return null;
          deck = measured;
          fs.writeFileSync(deckFile, JSON.stringify(deck), "utf8");
          quality = await buildAndVerify();
          if (!qualityRendered(quality)) return null;
        }
      }
      {
        const rollback = rollbackRegressedNativeTexts({ baselineDeck: baseline.deck, candidateDeck: deck,
          baselineQuality: baseline.quality, candidateQuality: quality, strictMetrics: true });
        if (proposed - rollback.rolledBackTextBoxes < 1) return null;
        if (rollback.rolledBackTextBoxes > 0) {
          deck = /** @type {Deck} */ (rollback.deck); rolledBackTextBoxes = rollback.rolledBackTextBoxes;
          validateDeck(deck, root);
          if (!auditSemantic(deck).passed) return null;
          fs.writeFileSync(deckFile, JSON.stringify(deck), "utf8");
          quality = await buildAndVerify();
        }
        if (!qualityRendered(quality) || !qualityAcceptable({ baselineQuality: baseline.quality, candidateQuality: quality })) return null;
        if (rollbackRegressedNativeTexts({ baselineDeck: baseline.deck, candidateDeck: deck,
          baselineQuality: baseline.quality, candidateQuality: quality, strictMetrics: true }).rolledBackTextBoxes > 0) return null;
      }
      adopted = true;
      return { ...baseline, deck, deckFile, pptxFile, renderedImages, quality: { ...quality, metrics: { ...quality.metrics,
        "native-only-text-weight-refinement-accepted": 1, "native-only-text-weight-proposed-boxes": proposed,
        "native-only-text-weight-geometry-boxes": geometryChanges,
        "native-only-text-weight-rolled-back-boxes": rolledBackTextBoxes } } };
    } finally { if (!adopted) for (const file of owned) fs.rmSync(file, { force: true }); }
  };
}
module.exports = { createNativeOnlyTextWeightRefiner };
