"use strict";

const { largeRasterEditability, qualityRendered } = require("./worker-output-services");
const { componentWorstPriority, editableTextFontFamilyQualityAcceptable, finalRefinementQualityAcceptable, lightCardSourceStrokeQualityAcceptable, nativeOnlySemanticChecksPass, targetComponentQualityImproves } = require('./worker-quality-policy');
const { compactDeckLateTextSourceBudgetProvenance, earlyWorstTextCompositeCandidateLimits, earlyWorstTextCompositeNudgeCandidates, earlyWorstTextCompositeScaleCandidates, finalOcrEvidenceCandidateLimits, fitDeckEditableTextFontFamily, fitDeckOcrEvidenceToSource, fitDeckTextFidelityPrimitives, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedEditableTextFontFamilyCandidateLimits, focusedEditableTextFontFamilyCandidates, richOcrTextLayoutHeightScales, richOcrTextLayoutScaleCandidates, searchLegacyTexts, worstTextBoxNudgeCandidates, worstTextScaleCandidates } = require('./worker-text-evidence');
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { assertBuiltPptx, changedComponentKeysFromFit, nativeOnlyRefinementImproves, sha256 } = require('./worker-job-support');
const { dropLineTextCoveredForegroundCrops } = require("../slideclone-core/scene-plan/page-output-rules");
const { textWeightCandidateTargets } = require("../slideclone-core/typography/text-weight-candidate-targets");
const { hasMeasuredVisualGain } = require("./candidate-quality-policy");
const { validateDeckIr } = require("./worker-input-services");
const { readPng } = require("./worker-input-services");
const { TEXT_FIDELITY_PRIMITIVE_BUDGETS, boundedCandidateLimits, focusedCandidateLimits } = require('./worker-primitives');
const { planEvidenceTextWeightFit } = require("../slideclone-core/typography/text-weight-evidence");
const { planMeasuredSingleLineTextFit } = require("../slideclone-core/typography/measured-text-fit");
const { rollbackRegressedNativeTexts } = require("./text-candidate-rollback");
const { compactDeckFinalPrimitiveCandidate } = require('./worker-provenance');

async function tryBuildFinalOcrEvidenceFitCandidate({ root, metadata, outputFile: _outputFile, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function") return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckOcrEvidenceToSource(metadata.generatedDeck, { priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  let best = null;
  for (const limit of finalOcrEvidenceCandidateLimits(all.candidateTextBoxes)) {
    const fitted = fitDeckOcrEvidenceToSource(metadata.generatedDeck, { candidateLimit: limit, priorityIds });
    if (fitted.changedTextBoxes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-ocr-evidence-fit-${token}.json`);
    const pptxFile = path.join(root, `final-ocr-evidence-fit-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
    fs.closeSync(fs.openSync(pptxFile, "wx"));
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested });
    const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
    const targetKeys = changedComponentKeysFromFit(fitted, priorityIds);
    if (priorityIds.size > 0 && ![...targetKeys].some((key) => priorityIds.has(key))) {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
      continue;
    }
    const improvesBest = best === null
      || (finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality })
        && targetComponentQualityImproves({ baselineQuality: best.quality, candidateQuality, targetKeys }));
    if (accepted && improvesBest) {
      if (best) {
        fs.rmSync(best.deckFile, { force: true });
        fs.rmSync(best.pptxFile, { force: true });
      }
      best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes: all.candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, changedTextBoxes: all.candidateTextBoxes, candidateTextBoxes: all.candidateTextBoxes };
}

async function tryBuildFinalLineTextCoveredCropDropCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function") return null;
  const baselineRaster = largeRasterEditability(metadata.generatedDeck);
  if (baselineRaster.passed) return null;
  const candidateDeck = structuredClone(metadata.generatedDeck);
  let removedImages = 0;
  for (const page of Array.isArray(candidateDeck.pages) ? candidateDeck.pages : []) {
    const before = Array.isArray(page.images) ? page.images.length : 0;
    dropLineTextCoveredForegroundCrops(page);
    const after = Array.isArray(page.images) ? page.images.length : 0;
    removedImages += Math.max(0, before - after);
  }
  if (removedImages < 1) return { accepted: false, removedImages: 0 };
  const candidateRaster = largeRasterEditability(candidateDeck);
  const rasterImproved = candidateRaster.largeRasterCount < baselineRaster.largeRasterCount
    || candidateRaster.largestAreaRatio < baselineRaster.largestAreaRatio - 1e-9;
  if (!rasterImproved) return { accepted: false, removedImages, baselineRaster, candidateRaster, rejectionCode: "large-raster-not-improved" };
  if (!candidateRaster.passed) return { accepted: false, removedImages, baselineRaster, candidateRaster, rejectionCode: "large-raster-remaining" };
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const token = crypto.randomUUID();
  const deckFile = path.join(root, `final-line-text-covered-crop-drop-${token}.json`);
  const pptxFile = path.join(root, `final-line-text-covered-crop-drop-${token}.pptx`);
  fs.writeFileSync(deckFile, `${JSON.stringify(candidateDeck)}\n`, { encoding: "utf8", flag: "wx" });
  fs.closeSync(fs.openSync(pptxFile, "wx"));
  await runBuild({ deckFile, pptxFile });
  assertBuiltPptx(pptxFile);
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: candidateDeck, isCancellationRequested });
  const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
  if (!accepted) {
    fs.rmSync(deckFile, { force: true });
    fs.rmSync(pptxFile, { force: true });
    return { accepted: false, removedImages, baselineRaster, candidateRaster, quality: candidateQuality, rejectionCode: "visual-regressed" };
  }
  candidateDeck.meta = {
    ...(candidateDeck.meta || {}),
    finalLineTextCoveredCropDrop: {
      provider: "worker-final-line-text-covered-crop-drop-v1",
      removedImages,
      largeRasterCountBefore: baselineRaster.largeRasterCount,
      largeRasterCountAfter: candidateRaster.largeRasterCount,
      largestRasterAreaRatioBefore: baselineRaster.largestAreaRatio,
      largestRasterAreaRatioAfter: candidateRaster.largestAreaRatio
    }
  };
  fs.writeFileSync(deckFile, `${JSON.stringify(candidateDeck)}\n`, { encoding: "utf8" });
  return { accepted: true, removedImages, deck: candidateDeck, deckFile, pptxFile, quality: candidateQuality, baselineRaster, candidateRaster };
}

async function tryBuildFinalEditableTextFontFamilyCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = new Map([...new Set([...textWeightCandidateTargets(visualQuality), ...componentWorstPriority(visualQuality, { role: "text", kind: "text" }).keys()])].map((key, index) => [key, index]));
  const fontFamilies = focusedEditableTextFontFamilyCandidates();
  const candidateTextBoxes = Math.max(0, ...fontFamilies.map(fontFamily => fitDeckEditableTextFontFamily(metadata.generatedDeck, { fontFamily, priorityIds }).candidateTextBoxes));
  const proposals = candidateTextBoxes < 1 ? [] : fontFamilies.flatMap(fontFamily => focusedEditableTextFontFamilyCandidateLimits(candidateTextBoxes).map(candidateLimit => {
    const fitted = fitDeckEditableTextFontFamily(metadata.generatedDeck, { candidateLimit, fontFamily, priorityIds });
    return { deck: fitted.deck, changedTextBoxes: fitted.changedTextBoxes, parameters: { fontFamily } };
  }));
  return searchLegacyTexts({ root, metadata, sourceImages, visualQuality, runBuild, verify: rawImageQualityVerifier, cancelled: isCancellationRequested,
    family: "font-family", candidateTextBoxes, proposals, acceptQuality: (baselineQuality, candidateQuality) => hasMeasuredVisualGain(baselineQuality, candidateQuality)
      && (finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }) || editableTextFontFamilyQualityAcceptable({ baselineQuality, candidateQuality })) });
}

async function tryBuildFinalLateTextSourceBudgetCompactionCandidate({ root, metadata, visualQuality, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality)) return null;
  const compacted = compactDeckLateTextSourceBudgetProvenance(metadata.generatedDeck);
  const minimumUsefulRemovedFields = 64;
  if (compacted.removedFields < minimumUsefulRemovedFields) return { accepted: false, changedTextBoxes: compacted.changedTextBoxes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames };
  validateDeckIr(compacted.deck, root);
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  const deckFile = path.join(root, `final-late-text-source-budget-compaction-${crypto.randomUUID()}.json`);
  fs.writeFileSync(deckFile, `${JSON.stringify(compacted.deck)}\n`, { encoding: "utf8", flag: "wx" });
  return { accepted: true, changedTextBoxes: compacted.changedTextBoxes, removedFields: compacted.removedFields, removedFieldNames: compacted.removedFieldNames, deck: compacted.deck, deckFile, quality: visualQuality };
}

async function tryBuildFinalWorstTextColorCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstTextColors(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateTextBoxes)) {
    const fitted = fitDeckWorstTextColors(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedTextBoxes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-worst-text-color-${token}.json`);
    const pptxFile = path.join(root, `final-worst-text-color-${token}.pptx`);
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
      best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes: all.candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, changedTextBoxes: all.candidateTextBoxes, candidateTextBoxes: all.candidateTextBoxes };
}

async function tryBuildFinalWorstTextArrowGlyphCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstTextArrowGlyphs(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateTextBoxes)) {
    const fitted = fitDeckWorstTextArrowGlyphs(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedTextBoxes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-worst-text-arrow-glyph-${token}.json`);
    const pptxFile = path.join(root, `final-worst-text-arrow-glyph-${token}.pptx`);
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
      best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes: all.candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, changedTextBoxes: all.candidateTextBoxes, candidateTextBoxes: all.candidateTextBoxes };
}

async function tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstTextArrowGlyphs(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, addedShapes: 0, candidateTextBoxes: 0, candidateTextBoxesWithPrimitives: 0, skippedRuns: 0 };
  let best = null;
  let last = { changedTextBoxes: all.candidateTextBoxes, addedShapes: 0, candidateTextBoxes: all.candidateTextBoxes, candidateTextBoxesWithPrimitives: 0, skippedRuns: 0 };
  for (const limit of boundedCandidateLimits(all.candidateTextBoxes)) {
    const arrow = fitDeckWorstTextArrowGlyphs(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (arrow.changedTextBoxes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const arrowToken = crypto.randomUUID();
    const arrowDeckFile = path.join(root, `final-worst-text-arrow-glyph-with-text-fidelity-base-${arrowToken}.json`);
    const arrowPptxFile = path.join(root, `final-worst-text-arrow-glyph-with-text-fidelity-base-${arrowToken}.pptx`);
    fs.writeFileSync(arrowDeckFile, `${JSON.stringify(arrow.deck)}\n`, { encoding: "utf8", flag: "wx" });
    fs.closeSync(fs.openSync(arrowPptxFile, "wx"));
    await runBuild({ deckFile: arrowDeckFile, pptxFile: arrowPptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const renderedImages = [];
    await rawImageQualityVerifier({ root, pptxFile: arrowPptxFile, sourceImages, deck: arrow.deck, isCancellationRequested, collectRenderedPages: pages => renderedImages.push(...pages) });
    if (renderedImages.length !== sourceImages.length || renderedImages.some((file) => typeof file !== "string" || !fs.existsSync(file))) {
      fs.rmSync(arrowDeckFile, { force: true });
      fs.rmSync(arrowPptxFile, { force: true });
      continue;
    }
    for (const maximumRuns of TEXT_FIDELITY_PRIMITIVE_BUDGETS) {
      const candidate = fitDeckTextFidelityPrimitives(arrow.deck, { sourceImages, renderedImages, maximumRuns });
      last = { changedTextBoxes: arrow.changedTextBoxes, addedShapes: candidate.addedShapes, candidateTextBoxes: all.candidateTextBoxes, candidateTextBoxesWithPrimitives: candidate.candidateTextBoxes, skippedRuns: candidate.skippedRuns };
      if (candidate.addedShapes < 1) break;
      try {
        validateDeckIr(candidate.deck, root);
      } catch (error) {
        if (!String(error?.message || "").includes("editable deck structure exceeds safe limits")) throw error;
        continue;
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-worst-text-arrow-glyph-with-text-fidelity-${token}.json`);
      const pptxFile = path.join(root, `final-worst-text-arrow-glyph-with-text-fidelity-${token}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(candidate.deck)}\n`, { encoding: "utf8", flag: "wx" });
      fs.closeSync(fs.openSync(pptxFile, "wx"));
      await runBuild({ deckFile, pptxFile });
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: candidate.deck, isCancellationRequested });
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
        best = { accepted: true, changedTextBoxes: arrow.changedTextBoxes, addedShapes: candidate.addedShapes, candidateTextBoxes: all.candidateTextBoxes, candidateTextBoxesWithPrimitives: candidate.candidateTextBoxes, skippedRuns: candidate.skippedRuns, deck: candidate.deck, deckFile, pptxFile, quality: candidateQuality };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
    }
    fs.rmSync(arrowDeckFile, { force: true });
    fs.rmSync(arrowPptxFile, { force: true });
  }
  return best || { accepted: false, ...last };
}

async function tryBuildFinalWorstTextWeightCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const weightModes = ["regular", "bold"];
  const allByWeight = weightModes.map((targetWeight) => ({
    targetWeight,
    result: fitDeckWorstTextWeight(metadata.generatedDeck, { priorityIds, targetWeight })
  }));
  let candidateTextBoxes = allByWeight.reduce((sum, item) => sum + item.result.candidateTextBoxes, 0);
  let best = null;
  const isolatedPlans = textWeightCandidateTargets(visualQuality).flatMap(key => weightModes.map(targetWeight => ({
    targetWeight, fitted: fitDeckWorstTextWeight(metadata.generatedDeck, { priorityIds: new Map([[key, 0]]), targetWeight })
  })));
  const batchPlans = allByWeight.flatMap(({ targetWeight, result: all }) => boundedCandidateLimits(all.candidateTextBoxes).map(limit => ({
    targetWeight, fitted: fitDeckWorstTextWeight(metadata.generatedDeck, { candidateLimit: limit, priorityIds, targetWeight })
  })));
  const evidencePlans = Array.isArray(visualQuality.textWeightEvidence) ? [false, true].map(fitGeometry => {
    const deck = structuredClone(metadata.generatedDeck);
    let changedTextBoxes = 0;
    for (const [pageIndex, page] of deck.pages.entries()) {
      const plan = planEvidenceTextWeightFit({ textBoxes: page.textBoxes || [], slideSize: deck.slideSize, fitGeometry,
        evidence: visualQuality.textWeightEvidence.filter(item => item.pageIndex === pageIndex) });
      page.textBoxes = plan.textBoxes;
      changedTextBoxes += plan.changedTextBoxes;
    }
    return { targetWeight: "regular", remeasure: true, fitted: { deck, changedTextBoxes } };
  }) : [];
  candidateTextBoxes = Math.max(candidateTextBoxes, ...evidencePlans.map(plan => plan.fitted.changedTextBoxes));
  if (candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  const tried = new Set();
  const plans = [...evidencePlans, ...isolatedPlans, ...batchPlans];
  for (const { targetWeight, fitted, remeasure } of plans) {
      if (fitted.changedTextBoxes < 1) continue;
      const signature = sha256(JSON.stringify(fitted.deck.pages.map(page => page.textBoxes)));
      if (tried.has(signature)) continue;
      tried.add(signature);
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-worst-text-weight-${targetWeight}-${token}.json`);
      const pptxFile = path.join(root, `final-worst-text-weight-${targetWeight}-${token}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
      fs.closeSync(fs.openSync(pptxFile, "wx"));
      await runBuild({ deckFile, pptxFile });
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      let candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, referenceQuality: visualQuality, isCancellationRequested });
      if (remeasure && qualityRendered(candidateQuality) && Array.isArray(candidateQuality.textWeightEvidence)) {
        const measuredDeck = structuredClone(fitted.deck);
        for (const [pageIndex, page] of measuredDeck.pages.entries()) {
          const targetIds = (page.textBoxes || []).filter(text => text.source?.textWeightEvidenceFit).map(text => text.id);
          if (!targetIds.length) continue;
          const plan = planMeasuredSingleLineTextFit({ slideSize: measuredDeck.slideSize, textBoxes: page.textBoxes,
            measurements: candidateQuality.textWeightEvidence.filter(item => item.pageIndex === pageIndex), targetIds });
          page.textBoxes = plan.textBoxes;
        }
        plans.push({ targetWeight, remeasure: false, fitted: { deck: measuredDeck, changedTextBoxes: fitted.changedTextBoxes } });
      }
      if (remeasure !== undefined && qualityRendered(candidateQuality)
        && Array.isArray(visualQuality.componentLocalMetrics) && Array.isArray(candidateQuality.componentLocalMetrics)
        && !finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality })) {
        const rollback = rollbackRegressedNativeTexts({ baselineDeck: metadata.generatedDeck, candidateDeck: fitted.deck,
          baselineQuality: visualQuality, candidateQuality });
        if (rollback.rolledBackTextBoxes > 0 && rollback.rolledBackTextBoxes < fitted.changedTextBoxes) {
          fitted.deck = rollback.deck;
          fitted.changedTextBoxes -= rollback.rolledBackTextBoxes;
          fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, "utf8");
          if (await isCancellationRequested()) throw new Error("editable job was cancelled");
          await runBuild({ deckFile, pptxFile });
          if (await isCancellationRequested()) throw new Error("editable job was cancelled");
          candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck,
            referenceQuality: visualQuality, isCancellationRequested });
        }
      }
      const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
      const improvesBest = best === null || finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality });
      if (accepted && improvesBest) {
        if (best) {
          fs.rmSync(best.deckFile, { force: true });
          fs.rmSync(best.pptxFile, { force: true });
        }
        best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
  }
  return best || { accepted: false, changedTextBoxes: candidateTextBoxes, candidateTextBoxes };
}

async function tryBuildFinalWorstRichOcrTextLayoutCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstRichOcrTextLayout(metadata.generatedDeck, { priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  let best = null;
  for (const targetScale of richOcrTextLayoutScaleCandidates()) {
    for (const heightScale of richOcrTextLayoutHeightScales()) {
      for (const deltaYPt of [0, -0.25, 0.25]) {
        for (const limit of focusedCandidateLimits(all.candidateTextBoxes)) {
          const fitted = fitDeckWorstRichOcrTextLayout(metadata.generatedDeck, { candidateLimit: limit, priorityIds, targetScale, heightScale, deltaYPt });
          if (fitted.changedTextBoxes < 1) continue;
          if (await isCancellationRequested()) throw new Error("editable job was cancelled");
          const token = crypto.randomUUID();
          const deckFile = path.join(root, `final-worst-rich-ocr-text-layout-${token}.json`);
          const pptxFile = path.join(root, `final-worst-rich-ocr-text-layout-${token}.pptx`);
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
            best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes: all.candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality, targetScale, heightScale, deltaYPt };
          } else {
            fs.rmSync(deckFile, { force: true });
            fs.rmSync(pptxFile, { force: true });
          }
        }
      }
    }
  }
  return best || { accepted: false, changedTextBoxes: all.candidateTextBoxes, candidateTextBoxes: all.candidateTextBoxes };
}

async function tryBuildFinalWorstTextInkBoxCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstTextInkBoxes(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateTextBoxes)) {
    const fitted = fitDeckWorstTextInkBoxes(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedTextBoxes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-worst-text-ink-box-${token}.json`);
    const pptxFile = path.join(root, `final-worst-text-ink-box-${token}.pptx`);
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
      best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes: all.candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, changedTextBoxes: all.candidateTextBoxes, candidateTextBoxes: all.candidateTextBoxes };
}

async function tryBuildFinalWorstTextScaleCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested, targetScales = null, candidateLimits = null }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = new Map([...new Set([...textWeightCandidateTargets(visualQuality), ...componentWorstPriority(visualQuality, { role: "text", kind: "text" }).keys()])].map((key, index) => [key, index]));
  const all = fitDeckWorstTextScale(metadata.generatedDeck, { priorityIds });
  const scales = Array.isArray(targetScales) ? [...new Set(targetScales.filter(value => Number.isFinite(value) && value >= 0.92 && value <= 1.10))] : worstTextScaleCandidates();
  const limits = Array.isArray(candidateLimits) ? [...new Set(candidateLimits.filter(value => Number.isSafeInteger(value) && value > 0 && value <= all.candidateTextBoxes))] : boundedCandidateLimits(all.candidateTextBoxes);
  const proposals = all.candidateTextBoxes < 1 ? [] : scales.flatMap(targetScale => limits.map(candidateLimit => {
    const fitted = fitDeckWorstTextScale(metadata.generatedDeck, { candidateLimit, priorityIds, targetScale });
    return { deck: fitted.deck, changedTextBoxes: fitted.changedTextBoxes, parameters: { targetScale } };
  }));
  return searchLegacyTexts({ root, metadata, sourceImages, visualQuality, runBuild, verify: rawImageQualityVerifier, cancelled: isCancellationRequested,
    family: "text-scale", candidateTextBoxes: all.candidateTextBoxes, proposals, acceptQuality: (baselineQuality, candidateQuality) => hasMeasuredVisualGain(baselineQuality, candidateQuality)
      && (finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }) || lightCardSourceStrokeQualityAcceptable({ baselineQuality, candidateQuality })) });
}

async function tryBuildFinalWorstTextBoxNudgeCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstTextBoxNudge(metadata.generatedDeck, { priorityIds });
  const proposals = all.candidateTextBoxes < 1 ? [] : worstTextBoxNudgeCandidates().flatMap(deltaYPt => boundedCandidateLimits(Math.min(all.candidateTextBoxes, 3)).map(candidateLimit => {
    const fitted = fitDeckWorstTextBoxNudge(metadata.generatedDeck, { candidateLimit, priorityIds, deltaYPt });
    return { deck: fitted.deck, changedTextBoxes: fitted.changedTextBoxes, parameters: { deltaYPt } };
  }));
  return searchLegacyTexts({ root, metadata, sourceImages, visualQuality, runBuild, verify: rawImageQualityVerifier, cancelled: isCancellationRequested,
    family: "text-nudge", candidateTextBoxes: all.candidateTextBoxes, proposals,
    acceptQuality: (baselineQuality, candidateQuality) => finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }) });
}

async function tryBuildFinalWorstTextCompositeCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "text", kind: "text" });
  const all = fitDeckWorstTextComposite(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateTextBoxes < 1) return { accepted: false, changedTextBoxes: 0, candidateTextBoxes: 0 };
  let best = null;
  for (const targetScale of earlyWorstTextCompositeScaleCandidates()) {
    for (const deltaYPt of earlyWorstTextCompositeNudgeCandidates()) {
      for (const limit of earlyWorstTextCompositeCandidateLimits(all.candidateTextBoxes)) {
        const fitted = fitDeckWorstTextComposite(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds, targetScale, deltaYPt });
        if (fitted.changedTextBoxes < 1) continue;
        if (await isCancellationRequested()) throw new Error("editable job was cancelled");
        const token = crypto.randomUUID();
        const deckFile = path.join(root, `final-worst-text-composite-${token}.json`);
        const pptxFile = path.join(root, `final-worst-text-composite-${token}.pptx`);
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
          best = { accepted: true, changedTextBoxes: fitted.changedTextBoxes, candidateTextBoxes: all.candidateTextBoxes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality, targetScale, deltaYPt };
        } else {
          fs.rmSync(deckFile, { force: true });
          fs.rmSync(pptxFile, { force: true });
        }
      }
    }
  }
  return best || { accepted: false, changedTextBoxes: all.candidateTextBoxes, candidateTextBoxes: all.candidateTextBoxes };
}

async function tryBuildFinalTextFidelityPrimitiveCandidate({ root, metadata, outputFile, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const renderedImages = [];
  await rawImageQualityVerifier({ root, pptxFile: outputFile, sourceImages, deck: metadata.generatedDeck, isCancellationRequested, collectRenderedPages: pages => renderedImages.push(...pages) });
  if (renderedImages.length !== sourceImages.length || renderedImages.some((file) => typeof file !== "string" || !fs.existsSync(file))) return { accepted: false, addedShapes: 0, candidateTextBoxes: 0, skippedRuns: 0 };
  let best = null;
  let last = { addedShapes: 0, candidateTextBoxes: 0, skippedRuns: 0 };
  for (const maximumRuns of TEXT_FIDELITY_PRIMITIVE_BUDGETS) {
    const candidate = fitDeckTextFidelityPrimitives(metadata.generatedDeck, { sourceImages, renderedImages, maximumRuns });
    last = { addedShapes: candidate.addedShapes, candidateTextBoxes: candidate.candidateTextBoxes, skippedRuns: candidate.skippedRuns };
    if (candidate.addedShapes < 1) return { accepted: false, addedShapes: 0, candidateTextBoxes: candidate.candidateTextBoxes, skippedRuns: candidate.skippedRuns };
    const candidateDeck = compactDeckFinalPrimitiveCandidate(candidate.deck);
    try {
      validateDeckIr(candidateDeck, root);
    } catch (error) {
      if (!String(error?.message || "").includes("editable deck structure exceeds safe limits")) throw error;
      continue;
    }
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-text-fidelity-primitives-${token}.json`);
    const pptxFile = path.join(root, `final-text-fidelity-primitives-${token}.pptx`);
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
      best = { accepted: true, addedShapes: candidate.addedShapes, candidateTextBoxes: candidate.candidateTextBoxes, skippedRuns: candidate.skippedRuns, deck: candidateDeck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, ...last };
}

async function tryBuildNativeOnlyRichOcrTextLayoutCandidate({ root, baseline, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested }) {
  if (!baseline?.deck || !qualityRendered(baseline.quality)) return null;
  const priorityIds = componentWorstPriority(baseline.quality, { role: "text", kind: "text" });
  const all = fitDeckWorstRichOcrTextLayout(baseline.deck, { priorityIds });
  if (all.candidateTextBoxes < 1) return null;
  let best = null;
  for (const targetScale of [1.18, 1.24, 1.32]) {
    for (const limit of focusedCandidateLimits(all.candidateTextBoxes)) {
      const fitted = fitDeckWorstRichOcrTextLayout(baseline.deck, { candidateLimit: limit, priorityIds, targetScale, heightScale: 1, deltaYPt: 0 });
      if (fitted.changedTextBoxes < 1) continue;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `native-only-rich-ocr-text-layout-${token}.deck.json`);
      const pptxFile = path.join(root, `native-only-rich-ocr-text-layout-${token}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, "utf8");
      try {
        validateDeckIr(fitted.deck, root);
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
        deck: fitted.deck,
        isCancellationRequested,
        collectRenderedPages: (pages) => { renderedImages.push(...pages); }
      });
      const candidate = { deck: fitted.deck, deckFile, pptxFile, quality, raster: largeRasterEditability(fitted.deck), renderedImages, removed: baseline.removed };
      const improvesBaseline = nativeOnlyRefinementImproves({ baselineQuality: baseline.quality, candidateQuality: quality });
      const improvesBest = best === null || nativeOnlyRefinementImproves({ baselineQuality: best.quality, candidateQuality: quality });
      if (improvesBaseline && improvesBest && nativeOnlySemanticChecksPass(candidate.deck)) {
        if (best) {
          fs.rmSync(best.deckFile, { force: true });
          fs.rmSync(best.pptxFile, { force: true });
        }
        best = candidate;
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
    }
  }
  if (best?.quality?.metrics && typeof best.quality.metrics === "object") {
    best.quality.metrics = {
      ...best.quality.metrics,
      "native-only-rich-ocr-text-layout-applied": 1
    };
  }
  return best;
}

module.exports = { tryBuildFinalOcrEvidenceFitCandidate, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalEditableTextFontFamilyCandidate, tryBuildFinalLateTextSourceBudgetCompactionCandidate, tryBuildFinalWorstTextColorCandidate, tryBuildFinalWorstTextArrowGlyphCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildFinalWorstTextWeightCandidate, tryBuildFinalWorstRichOcrTextLayoutCandidate, tryBuildFinalWorstTextInkBoxCandidate, tryBuildFinalWorstTextScaleCandidate, tryBuildFinalWorstTextBoxNudgeCandidate, tryBuildFinalWorstTextCompositeCandidate, tryBuildFinalTextFidelityPrimitiveCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate };
