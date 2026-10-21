"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { types } = require("node:util");
const { rollbackRegressedMissingAdditions } = require("./missing-candidate-rollback");
const { runCandidatePair } = require("./candidate-pair-executor");
const { auditNativeComponentQuality } = require("../slideclone-core/native-component-quality");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property); }

function createNativeOnlyMissingRefiner(dependencies) {
  if (!record(dependencies) || !["qualityRendered", "fitDeckMissingNativeVisualAtomShapes", "nativeOnlyMissingNativeTargetBudgets", "validateDeckIr", "changedComponentKeysFromFit", "nativeOnlyRefinementImproves", "targetMissingNativeComponentQualityImproves", "nativeOnlyMissingNativeLinesDoesNotRegress", "nativeOnlySemanticChecksPass"].every(name => typeof dependencies[name] === "function")) throw new TypeError("Invalid missing native refiner dependencies");
  const { qualityRendered, fitDeckMissingNativeVisualAtomShapes, nativeOnlyMissingNativeTargetBudgets, validateDeckIr, changedComponentKeysFromFit, nativeOnlyRefinementImproves, targetMissingNativeComponentQualityImproves, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlySemanticChecksPass } = dependencies;
async function refineNativeOnlyResidualCandidateMissingNativeLines(input) {
  if (!record(input)) throw new TypeError("Invalid missing native refiner request");
  const { nativeOnlyCandidate, root, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested } = input;
  if (nativeOnlyCandidate && !record(nativeOnlyCandidate)) throw new TypeError("Invalid missing native refiner baseline");
  if (!nativeOnlyCandidate || nativeOnlyCandidate.rejected === true) return nativeOnlyCandidate;
  if (!record(nativeOnlyCandidate.quality) || !record(nativeOnlyCandidate.deck)) throw new TypeError("Invalid missing native refiner baseline");
  if (!nativeOnlyCandidate || nativeOnlyCandidate.rejected === true || !qualityRendered(nativeOnlyCandidate.quality)
    || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) {
    return nativeOnlyCandidate;
  }
  if (typeof root !== "string" || !path.isAbsolute(root) || typeof runBuild !== "function" || typeof isCancellationRequested !== "function") throw new TypeError("Invalid missing native refiner request");
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  validateDeckIr(nativeOnlyCandidate.deck, root);
  // This operation only adds shapes; its rollback also preserves all scene
  // evidence. Neither can close an unresolved scene object or relation. Keep
  // that veto and return it before spending renders on an impossible repair.
  const integrity = auditNativeComponentQuality(nativeOnlyCandidate.deck);
  if (integrity.checks.some(check => check.name === "source-scene-completion" && !check.passed)) {
    return { ...nativeOnlyCandidate, quality: { ...nativeOnlyCandidate.quality, metrics: {
      ...nativeOnlyCandidate.quality.metrics, "native-only-missing-native-lines-accepted": 0,
      "native-only-missing-native-lines-attempts": 0, "native-only-missing-native-lines-blocked-scene": 1
    } } };
  }
  const all = fitDeckMissingNativeVisualAtomShapes(nativeOnlyCandidate.deck, {
    sourceImages,
    renderedImages: nativeOnlyCandidate.renderedImages,
    visualQuality: nativeOnlyCandidate.quality,
    maximumTargets: 24,
    maximumAtoms: 80
  });
  if (all.addedShapes < 1) return nativeOnlyCandidate;
  let best = null;
  let attempted = 0;
  const budgets = nativeOnlyMissingNativeTargetBudgets(all.candidateTargets || 24);
  if (!Array.isArray(budgets) || types.isProxy(budgets) || budgets.length > 9
    || Reflect.ownKeys(budgets).length !== budgets.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(budgets)).some(property => !("value" in property))
    || budgets.some(value => !Number.isSafeInteger(value) || value < 1 || value > 24)
    || new Set(budgets).size !== budgets.length) throw new TypeError("Invalid missing native candidate budgets");
  const schedule = budgets.slice(), owned = new Set();
  let adopted = false;
  function cleanup(keep) {
    const failures = [];
    for (const file of owned) {
      if (keep && (file === best?.deckFile || file === best?.pptxFile)) continue;
      try { fs.rmSync(file, { force: true }); owned.delete(file); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Missing native candidate cleanup failed");
  }
  async function evaluate(maximumTargets, isCancellationRequested) {
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    let fitted = maximumTargets === 24 ? all : fitDeckMissingNativeVisualAtomShapes(nativeOnlyCandidate.deck, {
      sourceImages,
      renderedImages: nativeOnlyCandidate.renderedImages,
      visualQuality: nativeOnlyCandidate.quality,
      maximumTargets,
      maximumAtoms: 80
    });
    if (fitted.addedShapes < 1) return null;
    attempted += 1;
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `native-only-missing-native-lines-${token}.deck.json`);
    const pptxFile = path.join(root, `native-only-missing-native-lines-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
    owned.add(deckFile);
    try {
      validateDeckIr(fitted.deck, root);
    } catch {
      fs.rmSync(deckFile, { force: true });
      return null;
    }
    fs.closeSync(fs.openSync(pptxFile, "wx"));
    owned.add(pptxFile);
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const renderedImages = [];
    const referenceQuality = { ...nativeOnlyCandidate.quality, componentReferenceMetrics: undefined };
    let quality = await rawImageQualityVerifier({
      root,
      pptxFile,
      sourceImages,
      deck: fitted.deck,
      referenceQuality,
      isCancellationRequested,
      collectRenderedPages: (pages) => { renderedImages.push(...pages); }
    });
    if (!qualityRendered(quality)) return null;
    const rollback = rollbackRegressedMissingAdditions({ baselineDeck: nativeOnlyCandidate.deck, candidateDeck: fitted.deck,
      baselineQuality: referenceQuality, candidateQuality: quality });
    if (rollback.rolledBackShapes > 0) {
      if (rollback.retainedShapes < 1) return null;
      fitted = { ...fitted, deck: rollback.deck, addedShapes: rollback.retainedShapes };
      validateDeckIr(fitted.deck, root);
      if (!nativeOnlySemanticChecksPass(fitted.deck)) return null;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, "utf8");
      await runBuild({ deckFile, pptxFile });
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      renderedImages.length = 0;
      quality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, referenceQuality, isCancellationRequested,
        collectRenderedPages: pages => { renderedImages.push(...pages); } });
      if (!qualityRendered(quality)) return null;
      const rechecked = rollbackRegressedMissingAdditions({ baselineDeck: nativeOnlyCandidate.deck, candidateDeck: fitted.deck,
        baselineQuality: referenceQuality, candidateQuality: quality });
      if (rechecked.rolledBackShapes > 0) return null;
      quality = { ...quality, metrics: { ...quality.metrics, "native-only-missing-native-rolled-back-shapes": rollback.rolledBackShapes } };
    }
    const targetKeys = changedComponentKeysFromFit(fitted);
    const acceptedByGlobalImprovement = nativeOnlyRefinementImproves({ baselineQuality: nativeOnlyCandidate.quality, candidateQuality: quality });
    const acceptedByTargetImprovement = targetMissingNativeComponentQualityImproves({ baselineQuality: referenceQuality, candidateQuality: quality, targetKeys })
      && nativeOnlyMissingNativeLinesDoesNotRegress({ baselineQuality: referenceQuality, candidateQuality: quality });
    const accepted = (acceptedByGlobalImprovement || acceptedByTargetImprovement) && nativeOnlySemanticChecksPass(fitted.deck);
    return { fitted, deckFile, pptxFile, quality, renderedImages, accepted, acceptedByGlobalImprovement, acceptedByTargetImprovement, maximumTargets };
  }
  try {
  // These candidates share an immutable baseline, not each other's output.
  // Pair only existing target allocations; rollback within a candidate remains
  // sequential and selection follows the original allocation order.
  for (let offset = 0; offset < schedule.length; offset += 2) {
    const candidates = await runCandidatePair(schedule.slice(offset, offset + 2)
      .map(maximumTargets => cancelled => evaluate(maximumTargets, cancelled)), isCancellationRequested);
    for (const candidate of candidates) {
      if (!candidate) continue;
      const improvesBest = best === null || nativeOnlyRefinementImproves({ baselineQuality: best.quality, candidateQuality: candidate.quality });
      if (candidate.accepted && improvesBest) best = candidate;
    }
    cleanup(true);
  }
  if (!best) {
    return {
      ...nativeOnlyCandidate,
      quality: {
        ...nativeOnlyCandidate.quality,
        metrics: {
          ...(nativeOnlyCandidate.quality?.metrics || {}),
          "native-only-missing-native-lines-accepted": 0,
          "native-only-missing-native-lines-shapes": all.addedShapes,
          "native-only-missing-native-lines-targets": all.candidateTargets || 0,
          "native-only-missing-native-lines-atoms": all.candidateAtoms || 0,
          "native-only-missing-native-lines-attempts": attempted
        }
      }
    };
  }
  const metrics = {
    ...(best.quality?.metrics || nativeOnlyCandidate.quality?.metrics || {}),
    "native-only-missing-native-lines-accepted": 1,
    "native-only-missing-native-lines-shapes": best.fitted.addedShapes,
    "native-only-missing-native-lines-targets": best.fitted.candidateTargets || 0,
    "native-only-missing-native-lines-atoms": best.fitted.candidateAtoms || 0,
    "native-only-missing-native-lines-attempts": attempted,
    "native-only-missing-native-lines-target-budget": best.maximumTargets,
    ...(best.acceptedByGlobalImprovement ? { "native-only-missing-native-lines-global-improved": 1 } : {}),
    ...(best.acceptedByTargetImprovement ? { "native-only-missing-native-lines-target-improved": 1 } : {})
  };
  adopted = true;
  return {
    ...nativeOnlyCandidate,
    deck: best.fitted.deck,
    deckFile: best.deckFile,
    pptxFile: best.pptxFile,
    quality: {
      ...best.quality,
      metrics
    },
    renderedImages: best.renderedImages
  };
  } finally {
    // Both members of a failed pair are already joined. Never delete a build
    // or render's input while that process can still be using it.
    cleanup(adopted);
  }
}
return refineNativeOnlyResidualCandidateMissingNativeLines;
}
module.exports = { createNativeOnlyMissingRefiner };
