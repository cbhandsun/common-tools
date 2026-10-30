"use strict";

const { qualityRendered } = require("./worker-output-services");
const { componentWorstPriority, finalRefinementQualityAcceptable, lightCardSourceStrokeQualityAcceptable, nativeShapeThinStrokeQualityAcceptable, targetComponentQualityImproves } = require('./worker-quality-policy');
const { fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowSaturationPanelFills, fitDeckSaturatedColorPanels, focusedLightCardStrokeWidthCandidates } = require('./worker-surface-evidence');
const { boundedCandidateLimits, focusedCandidateLimits } = require('./worker-primitives');
const { readPng } = require("./worker-input-services");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { fitDeckSourceVerticalLines } = require('./worker-graphic-evidence-2');
const { fitDeckNativeShapeThinStrokes } = require('./worker-graphic-evidence');
const { changedComponentKeysFromFit, nativeShapeThinStrokeMultipliers } = require('./worker-job-support');
const { validateDeckIr } = require("./worker-input-services");

async function tryBuildFinalSaturatedColorPanelCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested, candidateLimits = null }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { kind: "shape" });
  const all = fitDeckSaturatedColorPanels(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  const limits = Array.isArray(candidateLimits)
    ? [...new Set(candidateLimits.filter((value) => Number.isSafeInteger(value) && value > 0 && value <= all.candidateShapes))]
    : boundedCandidateLimits(all.candidateShapes);
  for (const limit of limits) {
    const fitted = fitDeckSaturatedColorPanels(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedShapes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-saturated-color-panel-${token}.json`);
    const pptxFile = path.join(root, `final-saturated-color-panel-${token}.pptx`);
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

async function tryBuildFinalLowSaturationPanelFillCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "shape", kind: "shape" });
  const all = fitDeckLowSaturationPanelFills(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateShapes)) {
    const fitted = fitDeckLowSaturationPanelFills(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedShapes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-low-saturation-panel-fill-${token}.json`);
    const pptxFile = path.join(root, `final-low-saturation-panel-fill-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
    fs.closeSync(fs.openSync(pptxFile, "wx"));
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested, referenceQuality: visualQuality });
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

async function tryBuildFinalSourceVerticalLineCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "connector-straight", kind: "shape" });
  const all = fitDeckSourceVerticalLines(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateShapes)) {
    const fitted = fitDeckSourceVerticalLines(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedShapes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-source-vertical-line-${token}.json`);
    const pptxFile = path.join(root, `final-source-vertical-line-${token}.pptx`);
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

async function tryBuildFinalNativeShapeThinStrokeCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const priorityIds = componentWorstPriority(visualQuality, { kind: "shape" });
  const all = fitDeckNativeShapeThinStrokes(metadata.generatedDeck, { priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  for (const strokeWidthMultiplier of nativeShapeThinStrokeMultipliers()) {
    for (const limit of boundedCandidateLimits(all.candidateShapes)) {
      const fitted = fitDeckNativeShapeThinStrokes(metadata.generatedDeck, { candidateLimit: limit, priorityIds, strokeWidthMultiplier });
      if (fitted.changedShapes < 1) continue;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-native-shape-thin-stroke-${token}.json`);
      const pptxFile = path.join(root, `final-native-shape-thin-stroke-${token}.pptx`);
      fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
      fs.closeSync(fs.openSync(pptxFile, "wx"));
      await runBuild({ deckFile, pptxFile });
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested });
      const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality })
        || nativeShapeThinStrokeQualityAcceptable({ baselineQuality: visualQuality, candidateQuality });
      const improvesBest = best === null
        || finalRefinementQualityAcceptable({ baselineQuality: best.quality, candidateQuality })
        || nativeShapeThinStrokeQualityAcceptable({ baselineQuality: best.quality, candidateQuality });
      if (accepted && improvesBest) {
        if (best) {
          fs.rmSync(best.deckFile, { force: true });
          fs.rmSync(best.pptxFile, { force: true });
        }
        best = { accepted: true, changedShapes: fitted.changedShapes, candidateShapes: all.candidateShapes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality, strokeWidthMultiplier };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
    }
  }
  return best || { accepted: false, changedShapes: all.candidateShapes, candidateShapes: all.candidateShapes };
}

async function tryBuildFinalLightCardGeometryCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "container-border", kind: "shape" });
  const allowTextAnchorGeometry = priorityIds.size < 1;
  const all = fitDeckLightCardGeometry(metadata.generatedDeck, { pageImages, priorityIds, allowTextAnchorGeometry });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  const limits = priorityIds.size > 0
    ? [1, Math.min(3, priorityIds.size)].filter((value, index, values) => Number.isSafeInteger(value) && value > 0 && value <= all.candidateShapes && values.indexOf(value) === index)
    : focusedCandidateLimits(all.candidateShapes);
  const triedTargetSignatures = new Set();
  for (const limit of limits) {
    const fitted = fitDeckLightCardGeometry(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds, allowTextAnchorGeometry });
    if (fitted.changedShapes < 1) continue;
    const targetKeys = changedComponentKeysFromFit(fitted, priorityIds);
    if (priorityIds.size > 0 && ![...targetKeys].some((key) => priorityIds.has(key))) continue;
    const targetSignature = [...targetKeys].sort().join("|");
    if (targetSignature && triedTargetSignatures.has(targetSignature)) continue;
    if (targetSignature) triedTargetSignatures.add(targetSignature);
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-light-card-geometry-${token}.json`);
    const pptxFile = path.join(root, `final-light-card-geometry-${token}.pptx`);
    fs.writeFileSync(deckFile, `${JSON.stringify(fitted.deck)}\n`, { encoding: "utf8", flag: "wx" });
    fs.closeSync(fs.openSync(pptxFile, "wx"));
    await runBuild({ deckFile, pptxFile });
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const candidateQuality = await rawImageQualityVerifier({ root, pptxFile, sourceImages, deck: fitted.deck, isCancellationRequested });
    const targetImprovesBaseline = targetComponentQualityImproves({ baselineQuality: visualQuality, candidateQuality, targetKeys });
    const accepted = finalRefinementQualityAcceptable({ baselineQuality: visualQuality, candidateQuality }) && targetImprovesBaseline;
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

async function tryBuildFinalLightCardSideAccentCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "container-border", kind: "shape" });
  const all = fitDeckLightCardSideAccents(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, addedShapes: 0, candidateShapes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateShapes)) {
    const fitted = fitDeckLightCardSideAccents(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.addedShapes < 1) continue;
    try {
      validateDeckIr(fitted.deck, root);
    } catch (error) {
      if (String(error?.message || "").includes("editable deck structure exceeds safe limits")) continue;
      throw error;
    }
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-light-card-side-accent-${token}.json`);
    const pptxFile = path.join(root, `final-light-card-side-accent-${token}.pptx`);
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
      best = { accepted: true, addedShapes: fitted.addedShapes, candidateShapes: all.candidateShapes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality };
    } else {
      fs.rmSync(deckFile, { force: true });
      fs.rmSync(pptxFile, { force: true });
    }
  }
  return best || { accepted: false, addedShapes: all.candidateShapes, candidateShapes: all.candidateShapes };
}

async function tryBuildFinalLightCardStrokeColorCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "container-border", kind: "shape" });
  const all = fitDeckLightCardStrokeColors(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  for (const limit of boundedCandidateLimits(all.candidateShapes)) {
    const fitted = fitDeckLightCardStrokeColors(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds });
    if (fitted.changedShapes < 1) continue;
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const token = crypto.randomUUID();
    const deckFile = path.join(root, `final-light-card-stroke-color-${token}.json`);
    const pptxFile = path.join(root, `final-light-card-stroke-color-${token}.pptx`);
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

async function tryBuildFinalLightCardSourceStrokeCandidate({ root, metadata, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested, candidateLimits = null }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function" || !Array.isArray(sourceImages)) return null;
  const pageImages = sourceImages.map((file) => readPng(file));
  const priorityIds = componentWorstPriority(visualQuality, { role: "container-border", kind: "shape" });
  const all = fitDeckLightCardSourceStrokes(metadata.generatedDeck, { pageImages, priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  const limits = Array.isArray(candidateLimits)
    ? [...new Set(candidateLimits.filter((value) => Number.isSafeInteger(value) && value > 0 && value <= all.candidateShapes))]
    : focusedCandidateLimits(all.candidateShapes);
  for (const targetStrokeWidthPt of focusedLightCardStrokeWidthCandidates(0.55)) {
    for (const limit of limits) {
      const fitted = fitDeckLightCardSourceStrokes(metadata.generatedDeck, { candidateLimit: limit, pageImages, priorityIds, targetStrokeWidthPt });
      if (fitted.changedShapes < 1) continue;
      try {
        validateDeckIr(fitted.deck, root);
      } catch (error) {
        if (String(error?.message || "").includes("editable deck structure exceeds safe limits")) continue;
        throw error;
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-light-card-source-stroke-${token}.json`);
      const pptxFile = path.join(root, `final-light-card-source-stroke-${token}.pptx`);
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
        best = { accepted: true, changedShapes: fitted.changedShapes, candidateShapes: all.candidateShapes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality, targetStrokeWidthPt };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
    }
  }
  return best || { accepted: false, changedShapes: all.candidateShapes, candidateShapes: all.candidateShapes };
}

async function tryBuildFinalLightCardStrokeCandidate({ root, metadata, outputFile: _outputFile, sourceImages, visualQuality, rawImageQualityVerifier, runBuild, isCancellationRequested }) {
  if (!metadata?.generatedDeck || !qualityRendered(visualQuality) || typeof rawImageQualityVerifier !== "function") return null;
  const priorityIds = componentWorstPriority(visualQuality, { role: "container-border", kind: "shape" });
  const all = fitDeckLightCardStrokes(metadata.generatedDeck, { priorityIds });
  if (all.candidateShapes < 1) return { accepted: false, changedShapes: 0, candidateShapes: 0 };
  let best = null;
  const widths = focusedLightCardStrokeWidthCandidates();
  for (const targetStrokeWidthPt of widths) {
    for (const limit of focusedCandidateLimits(all.candidateShapes)) {
      const fitted = fitDeckLightCardStrokes(metadata.generatedDeck, { candidateLimit: limit, priorityIds, targetStrokeWidthPt });
      if (fitted.changedShapes < 1) continue;
      try {
        validateDeckIr(fitted.deck, root);
      } catch (error) {
        if (String(error?.message || "").includes("editable deck structure exceeds safe limits")) continue;
        throw error;
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const token = crypto.randomUUID();
      const deckFile = path.join(root, `final-light-card-stroke-${token}.json`);
      const pptxFile = path.join(root, `final-light-card-stroke-${token}.pptx`);
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
        best = { accepted: true, changedShapes: fitted.changedShapes, candidateShapes: all.candidateShapes, deck: fitted.deck, deckFile, pptxFile, quality: candidateQuality, targetStrokeWidthPt };
      } else {
        fs.rmSync(deckFile, { force: true });
        fs.rmSync(pptxFile, { force: true });
      }
    }
  }
  return best || { accepted: false, changedShapes: all.candidateShapes, candidateShapes: all.candidateShapes };
}

module.exports = { tryBuildFinalSaturatedColorPanelCandidate, tryBuildFinalLowSaturationPanelFillCandidate, tryBuildFinalSourceVerticalLineCandidate, tryBuildFinalNativeShapeThinStrokeCandidate, tryBuildFinalLightCardGeometryCandidate, tryBuildFinalLightCardSideAccentCandidate, tryBuildFinalLightCardStrokeColorCandidate, tryBuildFinalLightCardSourceStrokeCandidate, tryBuildFinalLightCardStrokeCandidate };
