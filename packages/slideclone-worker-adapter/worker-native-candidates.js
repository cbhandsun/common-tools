"use strict";

const { createPictorialCandidateBuilder } = require("./pictorial-candidate-transaction");
const { createTiledVisualFallbackDeck, nativeOnlyResidualRejected, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, visualFallbackCandidateDiagnostics } = require('./worker-native-recovery-2');
const { validateDeckIr } = require("./worker-input-services");
const { componentWorstPriority, finalRefinementQualityAcceptable, hasAttentionTextWorstComponent, lightCardSourceStrokeQualityAcceptable, nativeOnlySemanticChecksPass, targetComponentQualityImproves } = require('./worker-quality-policy');
const { changedComponentKeysFromFit, isEditableJobCancellation, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyRefinementImproves, prioritizeComponentWorstByContribution, sha256 } = require('./worker-job-support');
const { auditNativeComponentQuality, largeRasterEditability, nativeObjectMetrics, qualityRendered, visualQualityDoesNotRegress } = require("./worker-output-services");
const { fitDeckWorstConnectorStyles } = require('./worker-graphic-evidence');
const { COMPONENT_FIDELITY_PRIMITIVE_BUDGETS, NATIVE_ONLY_COMPONENT_FIDELITY_PRIMITIVE_BUDGETS, NATIVE_ONLY_RESIDUAL_REJECTION_CODE, VISUAL_FALLBACK_REJECTION_CODE, boundedCandidateLimits, focusedCandidateLimits } = require('./worker-primitives');
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckWorstComponentFidelityPrimitives } = require('./worker-graphic-evidence-2');
const { readPng } = require("./worker-input-services");
const { compactDeckFinalPrimitiveCandidate, compactDeckLateShapeSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance } = require('./worker-provenance');
const { fitDeckMissingNativeVisualAtomShapes } = require('./worker-missing-graphics-2');
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES } = require("./worker-output-services");
const { refineNativeOnlyPanels } = require('./worker-surface-evidence');
const { tryBuildNativeOnlyRichOcrTextLayoutCandidate } = require('./worker-text-candidates');
const { auditSemanticEditability } = require("./worker-output-services");
const { visualFallbackRejection } = require('./worker-native-recovery');

const tryBuildNativeOnlyPictorialIconCandidate = createPictorialCandidateBuilder({ replace: replacePictorialIconCropsWithNativeShapes, validateDeck: validateDeckIr, semanticChecksPass: nativeOnlySemanticChecksPass, doesNotRegress: nativeOnlyRefinementDoesNotMateriallyRegress, raster: largeRasterEditability });

async function tryBuildFinalWorstConnectorStyleCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "connector-straight", kind: "shape" });
  if (priorityIds.size < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  const all = fitDeckWorstConnectorStyles(metadata.generatedDeck, { priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  const styleCandidates = [
    { strokeWidthMultiplier: 1.12 },
    { strokeWidthMultiplier: 1.25 },
    { strokeWidthMultiplier: 1, lineCap: "round" },
    { strokeWidthMultiplier: 1.12, lineCap: "round" }
  ];
  for (const limit of boundedCandidateLimits(Math.min(all.candidateShapes, 2))) {
    for (const style of styleCandidates) {
      const fitted = fitDeckWorstConnectorStyles(metadata.generatedDeck, { candidateLimit: limit, priorityIds, ...style });
      if (fitted.changedShapes < 1) continue;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-worst-connector-style-${token}.json`);
      const pptxFile = path.join(root, `final-worst-connector-style-${token}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
      fs.closeSync(fs.openSync(pptxFile, "wx"));
      await runBuild({ deckFile, pptxFile });
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested });
      const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality })
        || lightCardSourceStrokeQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
      const improvesBest = best === null
        || finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality })
        || lightCardSourceStrokeQualityAcceptable({ baselineQuality: best.quality, candidateQuality });
      if (accepted && improvesBest) {
        if (best) {
          fs.rmSync(best.deckFile, { force: true });
          fs.rmSync(best.pptxFile, { force: true });
        }
        best = { accepted: true, changedShapes: fitted.changedShapes, candidateShapes: all.candidateShapes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
    }
  }
  return best || { accepted: false, changedShapes: all.candidateShapes, candidateShapes: all.candidateShapes };
}

async function tryBuildFinalLowContrastFooterMarkCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "shape", kind: "shape" });
  const all = fitDeckLowContrastFooterMarks(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateShapes)) {
    const fitted = fitDeckLowContrastFooterMarks(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedShapes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-low-contrast-footer-mark-${token}.json`);
    const pptxFile = path.join(root, `final-low-contrast-footer-mark-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
    fs.closeSync(fs.openSync(pptxFile, "wx"));
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested });
    const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
    const improvesBest = best === null || finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality });
    if (accepted && improvesBest) {
      if (best) {
        fs.rmSync(best.deckFile, { force: true });
        fs.rmSync(best.pptxFile, { force: true });
      }
      best = { accepted: true, changedShapes: fitted.changedShapes, candidateShapes: all.candidateShapes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, changedShapes: all.candidateShapes, candidateShapes: all.candidateShapes };
}

async function tryBuildFinalLowContrastFooterPrimitiveCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "shape", kind: "shape" });
  const fitted = fitDeckLowContrastFooterPrimitives(metadata.generatedDeck, { root, sourceImages, priorityIds });
  if (fitted.addedShapes < 1) return { accepted: false, addedShapes: 0, candidatePages: fitted.candidatePages, skipped: fitted.skipped };
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const token = crypto.randomUUID();
  const deckFile = path.join(root, `final-low-contrast-footer-primitives-${token}.json`);
  const pptxFile = path.join(root, `final-low-contrast-footer-primitives-${token}.pptx`);
  fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
  fs.closeSync(fs.openSync(pptxFile, "wx"));
  await runBuild({ deckFile, pptxFile });
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested });
  const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
  if (accepted) return { accepted: true, addedShapes: fitted.addedShapes, candidatePages: fitted.candidatePages, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
  fs.rmSync(deckFile, { force: true });
  fs.rmSync(pptxFile, { force: true });
  return { accepted: false, addedShapes: fitted.addedShapes, candidatePages: fitted.candidatePages, skipped: fitted.skipped };
}

async function tryBuildFinalShapeSourceProvenanceCompactionCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const compacted = compactDeckNativeShapeSourceProvenance(metadata.generatedDeck);
  const minimumUsefulRemovedFields = 64;
  if (compacted.removedFields < 1) return { accepted: false, changedShapes: 0, removedFields: 0, removedFieldNames: [] };
  if (compacted.removedFields < minimumUsefulRemovedFields) return { accepted: false, changedShapes: compacted.changedShapes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames };
  validateDeckIr(compacted.deck, root);
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const token = crypto.randomUUID();
  const deckFile = path.join(root, `final-shape-source-provenance-compaction-${token}.json`);
  const pptxFile = path.join(root, `final-shape-source-provenance-compaction-${token}.pptx`);
  fs.writeFileSync(deckFile, `${JSON.stringify(compacted.deck)}\n`, { encoding: "utf8", flag: "wx" });
  fs.closeSync(fs.openSync(pptxFile, "wx"));
  await runBuild({ deckFile, pptxFile });
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: compacted.deck, isCancellationRequested });
  const accepted = visualQualityDoesNotRegress({ baselineQuality: visualQuality, candidateQuality });
  if (accepted) return { accepted: true, changedShapes: compacted.changedShapes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames, deck: compacted.deck, deckFile, pptxFile, quality: candidateQuality };
  fs.rmSync(deckFile, { force: true });
  fs.rmSync(pptxFile, { force: true });
  return { accepted: false, changedShapes: compacted.changedShapes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames };
}

async function tryBuildFinalLateShapeSourceBudgetCompactionCandidate({ root, metadata, visualQuality, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality)) return null;
  const compacted = compactDeckLateShapeSourceBudgetProvenance(metadata.generatedDeck);
  const minimumUsefulRemovedFields = 64;
  if (compacted.removedFields < minimumUsefulRemovedFields) return { accepted: false, changedShapes: compacted.changedShapes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames };
  validateDeckIr(compacted.deck, root);
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const deckFile = path.join(root, `final-late-shape-source-budget-compaction-${crypto.randomUUID()}.json`);
  fs.writeFileSync(deckFile, `${JSON.stringify(compacted.deck)}\n`, { encoding: "utf8", flag: "wx" });
  return { accepted: true, changedShapes: compacted.changedShapes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames, deck: compacted.deck, deckFile, quality: visualQuality };
}

async function tryBuildFinalMissingNativeVisualAtomCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const all = fitDeckMissingNativeVisualAtomShapes(metadata.generatedDeck, { sourceImages, visualQuality });
  const curves = fitDeckMissingNativeVisualAtomShapes(metadata.generatedDeck, { sourceImages, visualQuality, repairMode: "curves-only" });
  const diagonals = fitDeckMissingNativeVisualAtomShapes(metadata.generatedDeck, { sourceImages, visualQuality, repairMode: "diagonals-only" });
  if (all.addedShapes < 1 && curves.addedShapes < 1 && diagonals.addedShapes < 1) return { accepted: false, addedShapes: 0, candidateTargets: all.candidateTargets || 0, candidateAtoms: all.candidateAtoms || 0 };
  let best = null;
  let last = { addedShapes: all.addedShapes, candidateTargets: all.candidateTargets, candidateAtoms: all.candidateAtoms };
  const targetLimits = focusedCandidateLimits(Math.max(1, all.candidateTargets || 1));
  const atomLimits = focusedCandidateLimits(Math.max(1, all.candidateAtoms || all.addedShapes || 1));
  const triedTargetSignatures = new Set();
  const plans = [
    ...(curves.addedShapes > 0 ? [{ fitted: curves }] : []),
    ...(diagonals.addedShapes > 0 ? [{ fitted: diagonals }] : []),
    ...targetLimits.flatMap(targetLimit => atomLimits.map(atomLimit => ({ targetLimit, atomLimit })))
  ];
  for (const plan of plans) {
      const fitted = plan.fitted || fitDeckMissingNativeVisualAtomShapes(metadata.generatedDeck, {
        sourceImages,
        visualQuality,
        maximumTargets: plan.targetLimit,
        maximumAtoms: plan.atomLimit
      });
      last = { addedShapes: fitted.addedShapes, candidateTargets: fitted.candidateTargets, candidateAtoms: fitted.candidateAtoms };
      if (fitted.addedShapes < 1) continue;
      const targetKeys = changedComponentKeysFromFit(fitted);
      if (targetKeys.size < 1) continue;
      const targetSignature = sha256(JSON.stringify(fitted.deck.pages.map(page => page.shapes)));
      if (targetSignature && triedTargetSignatures.has(targetSignature)) continue;
      if (targetSignature) triedTargetSignatures.add(targetSignature);
      const candidateDeck = compactDeckFinalPrimitiveCandidate(fitted.deck);
      try {
        validateDeckIr(candidateDeck, root);
      } catch (error) {
        if (!String(error?.message || "").includes("editable deck structure exceeds safe limits")) throw error;
        continue;
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-missing-native-visual-atom-${token}.json`);
      const pptxFile = path.join(root, `final-missing-native-visual-atom-${token}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(candidateDeck)}\n`, { encoding: "utf8", flag: "wx" });
      fs.closeSync(fs.openSync(pptxFile, "wx"));
      await runBuild({ deckFile, pptxFile });
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: candidateDeck, isCancellationRequested });
      const targetImprovesBaseline = targetComponentQualityImproves({ baselineQuality: visualQuality, candidateQuality, targetKeys });
      const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality }) && targetImprovesBaseline;
      const improvesBest = best === null
        || (finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality })
          && targetComponentQualityImproves({ baselineQuality: best.quality, candidateQuality, targetKeys }));
      if (accepted && improvesBest) {
        if (best) {
          fs.rmSync(best.deckFile, { force: true });
          fs.rmSync(best.pptxFile, { force: true });
        }
        best = { accepted: true, addedShapes: fitted.addedShapes, candidateTargets: fitted.candidateTargets, candidateAtoms: fitted.candidateAtoms, deck: candidateDeck, deckFile, pptxFile, quality: candidateQuality };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
  }
  return best || { accepted: false, ...last };
}

async function tryBuildFinalWorstComponentFidelityPrimitiveCandidate({ root, metadata, outputFile, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  if (componentWorstPriority(visualQuality).size < 1) return { accepted: false, addedShapes: 0, candidateComponents: 0, candidateTargets: 0, skippedRuns: 0 };
  const renderedImages = [];
  await rawImageQualityVerifier({ root, pptxFile: outputFile, sourceImages, deck: metadata.generatedDeck, isCancellationRequested, collectRenderedPages: pages => renderedImages.push(...pages) });
  if (renderedImages.length !== sourceImages.length || renderedImages.some((file) => typeof file !== "string" || !fs.existsSync(file))) return { accepted: false, addedShapes: 0, candidateComponents: 0, candidateTargets: 0, skippedRuns: 0 };
  let best = null;
  let last = { addedShapes: 0, candidateComponents: 0, candidateTargets: 0, skippedRuns: 0 };
  const baseDeck = metadata.generatedDeck;
  for (const maximumRuns of COMPONENT_FIDELITY_PRIMITIVE_BUDGETS) {
    const candidate = fitDeckWorstComponentFidelityPrimitives(baseDeck, { sourceImages, renderedImages, visualQuality, maximumRuns, targetKinds: ["shape", "missing"] });
    last = { addedShapes: candidate.addedShapes, candidateComponents: candidate.candidateComponents, candidateTargets: candidate.candidateTargets, skippedRuns: candidate.skippedRuns };
    if (candidate.addedShapes < 1) return { accepted: false, addedShapes: 0, candidateComponents: candidate.candidateComponents, candidateTargets: candidate.candidateTargets, skippedRuns: candidate.skippedRuns };
    const candidateDeck = compactDeckFinalPrimitiveCandidate(candidate.deck);
    try {
      validateDeckIr(candidateDeck, root);
    } catch (error) {
      if (!String(error?.message || "").includes("editable deck structure exceeds safe limits")) throw error;
      continue;
    }
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-worst-component-fidelity-primitives-${token}.json`);
    const pptxFile = path.join(root, `final-worst-component-fidelity-primitives-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(candidateDeck)}\n`, { encoding: "utf8", flag: "wx" });
    fs.closeSync(fs.openSync(pptxFile, "wx"));
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: candidateDeck, isCancellationRequested });
    const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
    const improvesBest = best === null || finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality });
    if (accepted && improvesBest) {
      if (best) {
        fs.rmSync(best.deckFile, { force: true });
        fs.rmSync(best.pptxFile, { force: true });
      }
      best = { accepted: true, addedShapes: candidate.addedShapes, candidateComponents: candidate.candidateComponents, candidateTargets: candidate.candidateTargets, skippedRuns: candidate.skippedRuns, deck: candidateDeck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, ...last };
}

async function tryBuildNativeOnlyResidualCandidate({ root, metadata, outputFile, rawImageQualityVerifier, sourceImages, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  let rejectionCode = NATIVE_ONLY_RESIDUAL_REJECTION_CODE.unexpected;
  let removed = 0;
  let nativeResidualPrimitives = 0;
  try {
    const direct = await buildNativeOnlyResidualCandidate({
      root,
      deck: metadata.generatedDeck,
      suffix: "direct",
      sourceImages,
      runBuild,
      rawImageQualityVerifier,
      isCancellationRequested,
      updateRejectionCode: (code) => { rejectionCode = code; }
    });
    if (!direct) return null;
    removed = direct.removed;
    return { ...direct, nativeResidualPrimitives: 0, previousOutputFile: outputFile };
  } catch (error) {
    if (isEditableJobCancellation(error)) throw error;
    return nativeOnlyResidualRejected(rejectionCode, { removed, nativeResidualPrimitives });
  }
}

async function buildNativeOnlyResidualCandidate({ root, deck, suffix, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested, updateRejectionCode }) {
  const stripped = removeFullSlideResidualImages(deck, { includeSemanticUnderlays: true });
  if (stripped.removed < 1) return null;
  const raster = largeRasterEditability(stripped.deck);
  if (!raster.passed) return null;
  const safeSuffix = typeof suffix === "string" && /^[a-z0-9-]{1,32}$/u.test(suffix) ? suffix : "candidate";
  const deckFile = path.join(root, `native-only-residual-removed-${safeSuffix}.deck.json`);
  const pptxFile = path.join(root, `native-only-residual-removed-${safeSuffix}.pptx`);
  fs.writeFileSync(deckFile, `${JSON.stringify(stripped.deck)}\n`, "utf8");
  updateRejectionCode?.(NATIVE_ONLY_RESIDUAL_REJECTION_CODE.deckValidation);
  validateDeckIr(stripped.deck, root);
  updateRejectionCode?.(NATIVE_ONLY_RESIDUAL_REJECTION_CODE.build);
  await runBuild({ deckFile, pptxFile });
  updateRejectionCode?.(NATIVE_ONLY_RESIDUAL_REJECTION_CODE.artifact);
  if (!fs.existsSync(pptxFile) || !fs.statSync(pptxFile).isFile() || fs.statSync(pptxFile).size < 1 || fs.statSync(pptxFile).size > MAX_PPTX_BYTES) {
    return nativeOnlyResidualRejected(NATIVE_ONLY_RESIDUAL_REJECTION_CODE.artifact, { removed: stripped.removed });
  }
  const renderedImages = [];
  updateRejectionCode?.(NATIVE_ONLY_RESIDUAL_REJECTION_CODE.quality);
  const quality = await rawImageQualityVerifier({
    root,
    pptxFile,
    sourceImage: sourceImages[0],
    sourceImages,
    deck: stripped.deck,
    isCancellationRequested,
    collectRenderedPages: (pages) => { renderedImages.push(...pages); }
  });
  const direct = { deck: stripped.deck, deckFile, pptxFile, quality, raster, renderedImages, removed: stripped.removed };
  const panelRefined = await refineNativeOnlyPanels({ root, baseline: direct, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested });
  const panelBaseline = panelRefined || direct;
  const primitive = hasAttentionTextWorstComponent(panelBaseline.quality) ? null : await tryBuildNativeOnlyComponentFidelityPrimitiveCandidate({
    root,
    baseline: panelBaseline,
    sourceImages,
    runBuild,
    rawImageQualityVerifier,
    isCancellationRequested
  });
  const repaired = primitive || panelBaseline;
  const refined = hasAttentionTextWorstComponent(repaired.quality) ? null : await tryBuildNativeOnlyRichOcrTextLayoutCandidate({
    root,
    baseline: repaired,
    sourceImages,
    runBuild,
    rawImageQualityVerifier,
    isCancellationRequested
  });
  return refined || repaired;
}

async function tryBuildNativeOnlyComponentFidelityPrimitiveCandidate({ root, baseline, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested }) {
  if (!baseline?.deck || !qualityRendered(baseline.quality) || !Array.isArray(baseline.renderedImages) || baseline.renderedImages.length < 1) return null;
  let best = null;
  const visualQuality = prioritizeComponentWorstByContribution(baseline.quality, { targetKinds: ["missing", "shape"] });
  for (const maximumRuns of NATIVE_ONLY_COMPONENT_FIDELITY_PRIMITIVE_BUDGETS) {
    const fitted = fitDeckWorstComponentFidelityPrimitives(baseline.deck, {
      sourceImages,
      renderedImages: baseline.renderedImages,
      visualQuality,
      maximumRuns,
      maximumTargets: 16,
      targetKinds: ["missing", "shape"]
    });
    if (fitted.addedShapes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const candidateDeck = compactDeckFinalPrimitiveCandidate(fitted.deck);
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `native-only-component-fidelity-primitives-${token}.deck.json`);
    const pptxFile = path.join(root, `native-only-component-fidelity-primitives-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(candidateDeck)}\n`, "utf8");
    try {
      validateDeckIr(candidateDeck, root);
    } catch {
      fs.rmSync(deckFile, { force: true });
      continue;
    }
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const renderedImages = [];
    const quality = await rawImageQualityVerifier({
      root,
      pptxFile,
      sourceImage: sourceImages[0],
      sourceImages,
      deck: candidateDeck,
      isCancellationRequested,
      collectRenderedPages: (pages) => { renderedImages.push(...pages); }
    });
    const candidate = { deck: candidateDeck, deckFile, pptxFile, quality, raster: largeRasterEditability(candidateDeck), renderedImages, removed: baseline.removed, nativeResidualPrimitives: baseline.nativeResidualPrimitives || 0 };
    const improvesBaseline = nativeOnlyRefinementImproves({ baselineQuality: baseline.quality, candidateQuality: quality });
    const improvesBest = best === null || nativeOnlyRefinementImproves({ baselineQuality: best.quality, candidateQuality: quality });
    if (improvesBaseline && improvesBest && nativeOnlySemanticChecksPass(candidate.deck)) {
      if (best) {
        fs.rmSync(best.deckFile, { force: true });
        fs.rmSync(best.pptxFile, { force: true });
      }
      best = { ...candidate, componentFidelityPrimitiveShapes: fitted.addedShapes, componentFidelityPrimitiveTargets: fitted.candidateTargets, componentFidelityPrimitiveComponents: fitted.candidateComponents };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  if (best?.quality?.metrics && typeof best.quality.metrics === "object") {
    best.quality.metrics = {
      ...best.quality.metrics,
      "native-only-component-fidelity-primitives-applied": 1,
      "native-only-component-fidelity-primitives-shapes": best.componentFidelityPrimitiveShapes || 0,
      "native-only-component-fidelity-primitives-components": best.componentFidelityPrimitiveComponents || 0,
      "native-only-component-fidelity-primitives-targets": best.componentFidelityPrimitiveTargets || 0
    };
  }
  return best;
}

async function tryBuildVisualFallback({ root, sourceImages, metadata, outputFile, rawImageQualityVerifier, runBuild, isCancellationRequested, fallbackPrefix = "" }) {
  if (!Array.isArray(sourceImages) || !metadata?.generatedDeck || typeof rawImageQualityVerifier !== "function") return null;
  const rejections = [];
  for (const candidate of [
    { suffix: "native-lines", objectifySolidRegions: false, eraseNativeShapes: true, eraseNativeShapeMode: "lines" },
    { suffix: "native-erased", objectifySolidRegions: false, eraseNativeShapes: true, eraseNativeShapeMode: "all" },
    { suffix: "solid-regions", objectifySolidRegions: true, eraseNativeShapes: false, eraseNativeShapeMode: "all" },
    { suffix: "conservative", objectifySolidRegions: false, eraseNativeShapes: false, eraseNativeShapeMode: "all" }
  ]) {
    try {
      const fallbackDeck = createTiledVisualFallbackDeck({ baseDeck: metadata.generatedDeck, sourceImages, root, objectifySolidRegions: candidate.objectifySolidRegions, eraseNativeShapes: candidate.eraseNativeShapes, eraseNativeShapeMode: candidate.eraseNativeShapeMode, assetPrefix: fallbackPrefix });
      const originalMetrics = nativeObjectMetrics(metadata.generatedDeck);
      const fallbackMetrics = nativeObjectMetrics(fallbackDeck);
      if (fallbackMetrics.graphicalObjects < originalMetrics.graphicalObjects) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.graphicalObjectsRegressed));
        continue;
      }
      if (fallbackMetrics.connectors < originalMetrics.connectors) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.connectorsRegressed));
        continue;
      }
      const raster = largeRasterEditability(fallbackDeck);
      if (!raster.passed) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.largeRasterEditability));
        continue;
      }
      const nativeComponentQuality = auditNativeComponentQuality(fallbackDeck);
      if (!nativeComponentQuality.passed) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.nativeComponentQuality));
        continue;
      }
      const semanticEditability = auditSemanticEditability(fallbackDeck);
      if (!semanticEditability.passed) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.semanticEditability));
        continue;
      }
      const deckFile = path.join(root, `visual-fallback-${fallbackPrefix}${candidate.suffix}.deck.json`);
      const pptxFile = path.join(root, `visual-fallback-${fallbackPrefix}${candidate.suffix}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(fallbackDeck)}\n`, "utf8");
      try {
        validateDeckIr(fallbackDeck, root);
      } catch {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.deckValidation));
        continue;
      }
      try {
        await runBuild({ deckFile, pptxFile });
      } catch {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.build));
        continue;
      }
      const quality = await rawImageQualityVerifier({ root, pptxFile, sourceImage: sourceImages[0], sourceImages, deck: fallbackDeck, isCancellationRequested });
      const acceptedQuality = quality?.checks?.every((check) => check.passed) ? quality : null;
      if (!acceptedQuality) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.quality));
        continue;
      }
      if (!fs.existsSync(pptxFile) || !fs.statSync(pptxFile).isFile() || fs.statSync(pptxFile).size < 1 || fs.statSync(pptxFile).size > MAX_PPTX_BYTES) {
        rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.artifact));
        continue;
      }
      acceptedQuality.metrics = { ...(acceptedQuality.metrics || {}), ...visualFallbackCandidateDiagnostics(rejections), "editable-visible-text-fallback-enhanced-primitives": candidate.objectifySolidRegions ? 1 : 0, "editable-visible-text-fallback-native-shape-erasure": candidate.eraseNativeShapes ? 1 : 0, "editable-visible-text-fallback-native-line-erasure": candidate.eraseNativeShapeMode === "lines" ? 1 : 0 };
      return { deck: fallbackDeck, deckFile, pptxFile, quality: acceptedQuality, nativeComponentQuality, raster, previousOutputFile: outputFile };
    } catch (error) {
      if (/cancelled/iu.test(String(error?.message || ""))) throw error;
      rejections.push(visualFallbackRejection(candidate.suffix, VISUAL_FALLBACK_REJECTION_CODE.unexpected));
    }
  }
  metadata.visualFallbackRejections = visualFallbackCandidateDiagnostics(rejections);
  return null;
}

module.exports = { tryBuildNativeOnlyPictorialIconCandidate, tryBuildFinalWorstConnectorStyleCandidate, tryBuildFinalLowContrastFooterMarkCandidate, tryBuildFinalLowContrastFooterPrimitiveCandidate, tryBuildFinalShapeSourceProvenanceCompactionCandidate, tryBuildFinalLateShapeSourceBudgetCompactionCandidate, tryBuildFinalMissingNativeVisualAtomCandidate, tryBuildFinalWorstComponentFidelityPrimitiveCandidate, tryBuildNativeOnlyResidualCandidate, buildNativeOnlyResidualCandidate, tryBuildNativeOnlyComponentFidelityPrimitiveCandidate, tryBuildVisualFallback };
