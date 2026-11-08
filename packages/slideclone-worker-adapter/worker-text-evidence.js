"use strict";

const { createLegacyTextSearch, textFontFamilyMatches, replaceTextFontFamily } = require("./legacy-text-search");
const { recordWorkerCandidateDecision, recordWorkerSearchDecision } = require("./worker-budget-runner");
const { createOcrRecoverySelection } = require("./candidate-quality-policy");
const { auditNativeComponentQuality, nativeObjectMetrics, qualityRendered, assessOcrRecovery } = require("./worker-output-services");
const { createNativeOnlyTextRefiner } = require("./native-only-text-refinement");
const { validateDeckIr } = require("./worker-input-services");
const { auditSemanticEditability } = require("./worker-output-services");
const { componentQualityReferenceBox, finalRefinementQualityAcceptable, shouldTryNativeOnlyPrePolicyTextRefinement } = require('./worker-quality-policy');
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES } = require("./worker-output-services");
const fs = require("node:fs");
const path = require("node:path");
const { allPagesHaveNativeGraphics } = require('./worker-job-support');
const { residualDeduplicationStatus } = require('./worker-native-recovery');
const { fitHighConfidenceSingleLineOcrToEvidence } = require("../slideclone-core/typography/text-box-micro-adjust");
const { TEXT_FIDELITY_DELTA_THRESHOLD, TEXT_FIDELITY_PRIMITIVE_MAX_RUNS, clampSlideBox, colorBrightness, colorDistance, dominantColor, hexColor, isFiniteBox, pixelColor, pxToPtBox, rgbToHex, sameBox, saturationProxy } = require('./worker-primitives');
const { sourcePixelHex, sourceRenderedDelta } = require('./worker-graphic-evidence');
const { readPng } = require("./worker-input-services");

const searchLegacyTexts = createLegacyTextSearch({ recordSearch: recordWorkerSearchDecision, fontFamilies: focusedEditableTextFontFamilyCandidates() });

const selectOcrRecovery = createOcrRecoverySelection({ assess: assessOcrRecovery, recordDecision: recordWorkerCandidateDecision });

const refineNativeOnlyTextCandidate = createNativeOnlyTextRefiner({ refineGeometry: refineNativeOnlyResidualCandidateTextGeometry,
  validateDeck: validateDeckIr, auditSemantic: auditSemanticEditability, auditComponents: auditNativeComponentQuality,
  qualityRendered, qualityAcceptable: finalRefinementQualityAcceptable, maxPptxBytes: MAX_PPTX_BYTES });

function adoptOcrRecovery({ root, metadata, candidate, candidateRoot, candidateDeckFile, candidateOutputFile, outputFile }) {
  const admitted = validateDeckIr(candidate.deck, candidateRoot);
  fs.cpSync(path.join(candidateRoot, "assets"), path.join(root, "assets"), { recursive: true });
  fs.copyFileSync(candidateDeckFile, metadata.deckFile);
  fs.copyFileSync(candidateOutputFile, outputFile);
  validateDeckIr(candidate.deck, root);
  metadata.pages = admitted.pages; metadata.assets = admitted.assets;
  metadata.nativeMetrics = nativeObjectMetrics(candidate.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(candidate.deck);
  metadata.normalizedSourceImages = candidate.sourceImages; metadata.residualDeduplication = residualDeduplicationStatus(candidate.deck, candidate.residual);
  metadata.reconstructionProfile = candidate.reconstructionProfile; metadata.nativeComponentQuality = candidate.nativeComponentQuality;
  metadata.ocrCropRecovery = candidate.ocrCropRecovery; metadata.generatedDeck = candidate.deck;
}

function mergeRecoveredOcrTextForFallback(baseDeck, recoveryDeck) {
  const deck = structuredClone(baseDeck);
  for (let index = 0; index < (deck.pages || []).length; index += 1) {
    const basePage = deck.pages[index];
    const recoveryPage = recoveryDeck?.pages?.[index];
    if (!basePage || !recoveryPage) continue;
    const existingIds = new Set((basePage.textBoxes || []).map((textBox) => String(textBox?.id || "")));
    const recovered = (recoveryPage.textBoxes || [])
      .filter((textBox) => textBox?.source?.ocrRecoveredFromCrop === true)
      .filter((textBox) => !existingIds.has(String(textBox?.id || "")));
    basePage.textBoxes = [...(basePage.textBoxes || []), ...recovered];
  }
  deck.meta = { ...(deck.meta || {}), ocrRecoveryFallbackTextOnly: true };
  return deck;
}

function deckHasRecoveredOcrText(deck) {
  return countRecoveredOcrTextBoxes(deck) > 0;
}

function countRecoveredOcrTextBoxes(deck) {
  return (Array.isArray(deck?.pages) ? deck.pages : []).reduce((sum, page) =>
    sum + (Array.isArray(page?.textBoxes) ? page.textBoxes : []).filter((textBox) =>
      textBox?.source?.ocrRecoveredFromCrop === true || /^recovered-/u.test(String(textBox?.id || ""))).length, 0);
}

function finalOcrEvidenceCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, 2, 3, 6, 12, count].filter((value) => value <= count))];
}

function worstTextScaleCandidates() {
  return [0.94, 0.96, 0.98, 1.02, 1.04, 1.06, 1.08, 1.1];
}

function worstTextBoxNudgeCandidates() {
  return [0.2, -0.2, 0.35, -0.35, 0.5, 1, -0.5, -1];
}

function worstTextCompositeScaleCandidates() {
  return [1, 0.98, 1.02, 0.96, 1.04];
}

function richOcrTextLayoutScaleCandidates() {
  return [1.04, 1.08, 1.12, 1.18, 1.24, 1.32, 0.98, 0.96];
}

function richOcrTextLayoutHeightScales() {
  return [1, 1.12, 1.24, 1.36, 1.48];
}

function earlyWorstTextCompositeScaleCandidates() {
  return [1];
}

function earlyWorstTextCompositeNudgeCandidates() {
  return [0.35, -0.35];
}

function earlyWorstTextCompositeCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, 2].filter((value) => value <= count))];
}

function editableTextFontFamilyCandidates() {
  return ["Microsoft YaHei", "DengXian", "SimHei", "SimSun", "Noto Sans SC", "Arial", "Aptos", "Noto Sans CJK SC", "Noto Sans"];
}

function focusedEditableTextFontFamilyCandidates() {
  return editableTextFontFamilyCandidates().slice(0, 5);
}

function focusedEditableTextFontFamilyCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, Math.min(3, count)].filter((value) => value <= count))];
}

function fitDeckEditableTextFontFamily(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const fontFamily = typeof options.fontFamily === "string" && options.fontFamily.trim() ? options.fontFamily.trim() : "";
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  if (!editableTextFontFamilyCandidates().includes(fontFamily)) return { deck: next, changedTextBoxes: 0, candidateTextBoxes: 0 };
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const text = String(textBox?.text || "").trim();
      const sizePt = Number(textBox?.font?.sizePt);
      if (!text
        || !Number.isFinite(sizePt)
        || sizePt < 4
        || sizePt > 72
        || textFontFamilyMatches(textBox, fontFamily)
        || textBox?.style?.visibility === "hidden"
        || textBox?.style?.opacity === 0
        || textBox?.font?.opacity === 0
        || textBox?.source?.editable === false) continue;
      const key = `${pageIndex}:${String(textBox.id || "")}`;
      const priority = priorityIds.has(key) ? priorityIds.get(key) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, priority, score: Array.from(text).length });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  const annotateTextBoxes = selected.length <= 64;
  for (const item of selected) {
    const textBox = replaceTextFontFamily(next.pages[item.pageIndex].textBoxes[item.index], fontFamily);
    next.pages[item.pageIndex].textBoxes[item.index] = textBox;
    if (annotateTextBoxes) {
      textBox.source = { ...(textBox.source || {}), finalEditableTextFontFamilyFit: { provider: "worker-final-editable-text-font-family-fit-v1", fontFamily } };
    }
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalEditableTextFontFamilyFit: { provider: "worker-final-editable-text-font-family-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length, fontFamily } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function fitDeckOcrEvidenceToSource(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    if (!Array.isArray(page?.textBoxes)) continue;
    const before = page.textBoxes;
    const after = fitHighConfidenceSingleLineOcrToEvidence(before);
    for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
      if (!sameBox(before[index]?.box, after[index]?.box)
        || Number(before[index]?.font?.sizePt) !== Number(after[index]?.font?.sizePt)) {
        const beforeBox = before[index]?.box || {};
        const afterBox = after[index]?.box || {};
        const score = Math.abs(Number(afterBox.x) - Number(beforeBox.x))
          + Math.abs(Number(afterBox.y) - Number(beforeBox.y))
          + Math.abs(Number(afterBox.w) - Number(beforeBox.w)) * 0.5
          + Math.abs(Number(afterBox.h) - Number(beforeBox.h)) * 0.5
          + Math.abs(Number(after[index]?.font?.sizePt) - Number(before[index]?.font?.sizePt));
        const priority = priorityIds.has(`${pageIndex}:${before[index]?.id || ""}`) ? priorityIds.get(`${pageIndex}:${before[index].id}`) : Number.MAX_SAFE_INTEGER;
        candidates.push({ pageIndex, index, textBox: after[index], priority, score });
      }
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  const selectedKeys = new Set(selected.map((item) => `${item.pageIndex}:${item.index}`));
  for (const item of selected) next.pages[item.pageIndex].textBoxes[item.index] = item.textBox;
  const changedTextBoxes = selectedKeys.size;
  const changedComponentKeys = selected.map((item) => {
    const id = beforeTextBoxId(next.pages[item.pageIndex]?.textBoxes?.[item.index]);
    return id ? `${item.pageIndex}:${id}` : "";
  }).filter(Boolean);
  if (changedTextBoxes > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalOcrEvidenceFit: {
        provider: "worker-final-ocr-evidence-fit-v1",
        changedTextBoxes,
        candidateTextBoxes: candidates.length,
        changedComponentKeys
      }
    };
  }
  return { deck: next, changedTextBoxes, candidateTextBoxes: candidates.length, changedComponentKeys };
}

function beforeTextBoxId(textBox) {
  return typeof textBox?.id === "string" && textBox.id ? textBox.id : "";
}

function compactDeckLateTextSourceBudgetProvenance(deck) {
  const next = structuredClone(deck);
  let changedTextBoxes = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const removableFields = [
    "pageImage",
    "editable",
    "nativeRebuild",
    "overlayVisibility",
    "lineTextCropIds",
    "ocrRecoveredFromLineTextCrop",
    "ocrRecoveredFromNativeLineTextShape",
    "ocrRecoveredFromCrop",
    "splitFromTextBoxId",
    "semanticNativeStructure",
    "ocrEvidenceFit",
    "finalWorstTextScaleFit",
    "finalWorstTextBoxNudgeFit",
    "finalWorstTextInkBoxFit",
    "finalWorstTextWeightFit",
    "finalWorstTextColorFit"
  ];
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const textBox of Array.isArray(page?.textBoxes) ? page.textBoxes : []) {
      if (!textBox?.source || typeof textBox.source !== "object" || Array.isArray(textBox.source)) continue;
      let changed = false;
      for (const field of removableFields) {
        if (!Object.prototype.hasOwnProperty.call(textBox.source, field)) continue;
        delete textBox.source[field];
        removedFields += 1;
        removedFieldNames.add(field);
        changed = true;
      }
      if (changed) changedTextBoxes += 1;
    }
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalLateTextSourceBudgetCompaction: {
        provider: "worker-final-late-text-source-budget-compaction-v1",
        changedTextBoxes,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedTextBoxes, removedFields, removedFieldNames: [...removedFieldNames].sort() };
}

function fitDeckWorstTextScale(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetScale = Number.isFinite(options.targetScale) ? Math.max(0.9, Math.min(1.14, options.targetScale)) : 1.04;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority)) continue;
      const sizePt = Number(textBox?.font?.sizePt);
      if (!Number.isFinite(sizePt) || sizePt < 5 || sizePt > 60) continue;
      const textLength = Array.from(String(textBox.text || "").trim()).length;
      if (textLength < 1 || textLength > 180) continue;
      candidates.push({ pageIndex, index, priority, score: textLength });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    const originalFont = textBox.font;
    textBox.font = scaleFontSize(originalFont, targetScale);
    if (Array.isArray(textBox.runs)) textBox.runs = textBox.runs.map((run) => ({
      ...run, font: scaleFontSize({ ...originalFont, ...(run.font || {}) }, targetScale)
    }));
    textBox.source = { ...(textBox.source || {}), finalWorstTextScaleFit: { provider: "worker-final-worst-text-scale-fit-v1", scale: targetScale } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextScaleFit: { provider: "worker-final-worst-text-scale-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length, scale: targetScale } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function fitDeckWorstTextBoxNudge(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const deltaYPt = Number.isFinite(options.deltaYPt) ? Math.max(-1.5, Math.min(1.5, options.deltaYPt)) : 0.5;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority) || !textBox?.box) continue;
      const y = Number(textBox.box.y);
      const h = Number(textBox.box.h);
      const sizePt = Number(textBox?.font?.sizePt);
      if (!Number.isFinite(y) || !Number.isFinite(h) || !Number.isFinite(sizePt) || sizePt < 5 || sizePt > 24 || h < 2) continue;
      const textLength = Array.from(String(textBox.text || "").trim()).length;
      if (textLength < 1 || textLength > 180) continue;
      const nextY = y + deltaYPt;
      if (!Number.isFinite(nextY) || nextY < 0 || nextY + h > Number(next.slideSize?.heightPt || 0) + 1) continue;
      candidates.push({ pageIndex, index, priority, score: textLength });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    textBox.box = { ...textBox.box, y: Math.max(0, Number(textBox.box.y) + deltaYPt) };
    textBox.style = { ...(textBox.style || {}), marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink" };
    textBox.source = { ...(textBox.source || {}), finalWorstTextBoxNudgeFit: { provider: "worker-final-worst-text-box-nudge-fit-v1", deltaYPt } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextBoxNudgeFit: { provider: "worker-final-worst-text-box-nudge-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length, deltaYPt } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function fitDeckWorstTextWeight(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetWeight = options.targetWeight === "regular" ? "regular" : "bold";
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority)) continue;
      const sizePt = Number(textBox?.font?.sizePt);
      if (!Number.isFinite(sizePt) || sizePt < 5 || sizePt > 72
        || textBox?.style?.visibility === "hidden" || textBox?.style?.opacity === 0
        || textBox?.font?.opacity === 0 || textBox?.source?.editable === false) continue;
      const weight = String(textBox?.font?.weight || "regular").toLowerCase();
      const alreadyBold = weight === "bold" || weight === "700" || weight === "800" || weight === "900";
      if (targetWeight === "bold" && alreadyBold) continue;
      if (targetWeight === "regular" && !alreadyBold) continue;
      const textLength = Array.from(String(textBox.text || "").trim()).length;
      if (textLength < 1 || textLength > 180) continue;
      candidates.push({ pageIndex, index, priority, score: textLength });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    textBox.font = { ...(textBox.font || {}), weight: targetWeight };
    textBox.source = { ...(textBox.source || {}), finalWorstTextWeightFit: { provider: "worker-final-worst-text-weight-fit-v1", weight: targetWeight } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextWeightFit: { provider: "worker-final-worst-text-weight-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length, weight: targetWeight } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function fitDeckWorstRichOcrTextLayout(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetScale = Number.isFinite(options.targetScale) ? Math.max(0.94, Math.min(1.36, options.targetScale)) : 1.04;
  const heightScale = Number.isFinite(options.heightScale) ? Math.max(0.9, Math.min(1.5, options.heightScale)) : 1;
  const deltaYPt = Number.isFinite(options.deltaYPt) ? Math.max(-1.2, Math.min(1.2, options.deltaYPt)) : 0;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority) || !isRichOcrSingleLineTextBox(textBox) || !isFiniteBox(textBox.box)) continue;
      const sizePt = Number(textBox?.font?.sizePt);
      if (!Number.isFinite(sizePt) || sizePt < 5 || sizePt > 24) continue;
      const maxHeight = segmentedOcrLayoutMaxHeightPt(textBox);
      const h = Math.max(2, Math.min(maxHeight, Number(textBox.box.h) * heightScale));
      const y = Math.max(0, Number(textBox.box.y) + (Number(textBox.box.h) - h) / 2 + deltaYPt);
      if (!Number.isFinite(y) || y + h > Number(next.slideSize?.heightPt || 0) + 1) continue;
      const textLength = Array.from(String(textBox.text || "").trim()).length;
      const movement = Math.abs(targetScale - 1) * Math.max(1, textLength) + Math.abs(heightScale - 1) * 3 + Math.abs(deltaYPt);
      if (movement < 0.05) continue;
      candidates.push({ pageIndex, index, priority, score: movement, box: { ...textBox.box, y, h } });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    textBox.box = item.box;
    textBox.font = scaleFontSize(textBox.font, targetScale);
    if (Array.isArray(textBox.runs)) textBox.runs = textBox.runs.map((run) => ({ ...run, font: scaleFontSize(run.font || textBox.font || {}, targetScale) }));
    textBox.style = { ...(textBox.style || {}), marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink" };
    textBox.source = { ...(textBox.source || {}), finalWorstRichOcrTextLayoutFit: { provider: "worker-final-worst-rich-ocr-text-layout-fit-v1", scale: targetScale, heightScale, deltaYPt } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstRichOcrTextLayoutFit: { provider: "worker-final-worst-rich-ocr-text-layout-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length, scale: targetScale, heightScale, deltaYPt } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function isRichOcrSingleLineTextBox(textBox) {
  if (!textBox || typeof textBox !== "object") return false;
  if (String(textBox?.style?.visibility || "visible") === "hidden" || Number(textBox?.style?.opacity ?? 1) === 0) return false;
  const source = textBox.source || {};
  if (source.ocrProvider !== "team-pinned-ocr" || Number(source.confidence ?? 0) < 0.8) return false;
  const text = String(textBox.text || "").trim();
  if (!text || /[\r\n]/u.test(text)) return false;
  if (Array.isArray(textBox.runs) && textBox.runs.length >= 2 && Number(source.mixedColorTextRuns || 0) >= 2) {
    return textBox.runs.map((run) => String(run?.text || "")).join("").trim() === text;
  }
  return typeof source.segmentedOcrLineId === "string"
    && source.segmentedOcrLineId.length > 0
    && Number.isSafeInteger(source.segmentStartIndex)
    && Number.isSafeInteger(source.segmentEndIndex)
    && Number(source.segmentEndIndex) > Number(source.segmentStartIndex)
    && Number(source.mixedColorTextSegments || 0) >= 2;
}

function segmentedOcrLayoutMaxHeightPt(textBox) {
  const evidenceHeight = Number(textBox?.source?.evidenceBox?.h);
  if (typeof textBox?.source?.segmentedOcrLineId === "string" && Number.isFinite(evidenceHeight) && evidenceHeight > 0) {
    return Math.max(6, evidenceHeight * 1.1);
  }
  return Number.POSITIVE_INFINITY;
}

function scaleFontSize(font, scale) {
  const sizePt = Number(font?.sizePt);
  return {
    ...(font || {}),
    ...(Number.isFinite(sizePt) ? { sizePt: sizePt * scale } : {})
  };
}

function sourceTextInkColor(textBox, image, slideSize) {
  if (!textBox?.box || !image || !slideSize) return null;
  const currentColor = hexColor(textBox?.font?.color);
  if (!currentColor) return null;
  const reference = textBox.source?.evidenceBox || textBox.box;
  if (!reference || !Number.isFinite(reference.x) || !Number.isFinite(reference.y) || !Number.isFinite(reference.w) || !Number.isFinite(reference.h)) return null;
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const padX = Math.max(2, Math.round(reference.w * scaleX * 0.08));
  const padY = Math.max(2, Math.round(reference.h * scaleY * 0.16));
  const left = Math.max(0, Math.floor(reference.x * scaleX) - padX);
  const top = Math.max(0, Math.floor(reference.y * scaleY) - padY);
  const right = Math.min(image.width, Math.ceil((reference.x + reference.w) * scaleX) + padX);
  const bottom = Math.min(image.height, Math.ceil((reference.y + reference.h) * scaleY) + padY);
  const width = right - left; const height = bottom - top;
  if (width < 3 || height < 3 || width * height > 80_000) return null;
  const edgeColors = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const edge = x - left < padX || right - 1 - x < padX || y - top < padY || bottom - 1 - y < padY;
    if (!edge) continue;
    const color = pixelColor(image, x, y);
    if (color.a >= 160) edgeColors.push(color);
  }
  const background = dominantColor(edgeColors);
  if (!background) return null;
  const currentContrast = colorDistance(currentColor, background);
  const foreground = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a < 160) continue;
    const contrast = colorDistance(color, background);
    if (contrast < 42) continue;
    const brightnessGap = Math.abs(colorBrightness(color) - colorBrightness(background));
    if (brightnessGap < 28 && saturationProxy(color) < saturationProxy(background) + 18) continue;
    foreground.push(color);
  }
  if (foreground.length < Math.max(6, Math.min(48, Math.round(width * height * 0.015)))) return null;
  if (foreground.length / Math.max(1, width * height) > 0.42) return null;
  const dominant = dominantColor(foreground);
  if (!dominant || colorDistance(dominant, background) < 42) return null;
  if (currentContrast >= 120) return null;
  return rgbToHex(dominant);
}

function fitDeckWorstTextColors(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority)) continue;
      const sampled = sourceTextInkColor(textBox, image, next.slideSize);
      const current = hexColor(textBox?.font?.color);
      const sampledColor = hexColor(sampled);
      if (!sampled || !current || !sampledColor) continue;
      const score = colorDistance(sampledColor, current);
      if (score < 24) continue;
      candidates.push({ pageIndex, index, color: sampled, priority, score });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    textBox.font = { ...(textBox.font || {}), color: item.color };
    textBox.source = { ...(textBox.source || {}), finalWorstTextColorFit: { provider: "worker-final-worst-text-color-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextColorFit: { provider: "worker-final-worst-text-color-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function fitDeckWorstTextArrowGlyphs(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    const textBoxes = Array.isArray(page?.textBoxes) ? page.textBoxes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority) || !isRightArrowGlyphText(textBox) || !isFiniteBox(textBox.box)) continue;
      const color = sourceTextInkColor(textBox, image, next.slideSize) || textBox?.font?.color || "#3E63E3";
      const sampled = hexColor(color) ? color : "#3E63E3";
      candidates.push({ pageIndex, index, priority, score: Number(textBox.box.w || 0) * Number(textBox.box.h || 0), color: sampled });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const page = next.pages[item.pageIndex];
    const textBox = page.textBoxes[item.index];
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const box = textBox.box;
    const centerY = box.y + box.h * 0.56;
    page.shapes.push({
      id: `${textBox.id || `arrow-${item.index}`}-native-arrow`,
      type: "line",
      box: { x: box.x + box.w * 0.12, y: centerY, w: box.w * 0.76, h: 0 },
      style: {
        stroke: item.color,
        strokeWidthPt: Math.max(0.8, Math.min(2.4, box.h * 0.18)),
        connectorType: "straight",
        endArrow: "triangle",
        lineCap: "round"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "ocr-arrow-glyph-native-connector",
        sourceTextId: String(textBox.id || "")
      }
    });
    textBox.style = { ...(textBox.style || {}), visibility: "hidden", opacity: 0 };
    textBox.source = { ...(textBox.source || {}), componentQualityIgnore: true, finalWorstTextArrowGlyphFit: { provider: "worker-final-worst-text-arrow-glyph-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextArrowGlyphFit: { provider: "worker-final-worst-text-arrow-glyph-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function isRightArrowGlyphText(textBox) {
  const text = String(textBox?.text || "").trim();
  return ["→", "➜", "➔", "➡"].includes(text);
}

function findSourceTextInkBox(textBox, image, slideSize) {
  const colors = sourceTextInkColors(textBox);
  if (colors.length < 1 || !textBox?.box || !image || !slideSize) return null;
  const qualityBox = componentQualityReferenceBox(textBox);
  const reference = qualityBox || textBox.source?.evidenceBox || textBox.box;
  if (!reference || !Number.isFinite(reference.x) || !Number.isFinite(reference.y) || !Number.isFinite(reference.w) || !Number.isFinite(reference.h)) return null;
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((reference.x - 3) * scaleX));
  const top = Math.max(0, Math.floor((reference.y - 3) * scaleY));
  const right = Math.min(image.width, Math.ceil((reference.x + reference.w + 3) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((reference.y + reference.h + 3) * scaleY));
  const width = right - left; const height = bottom - top;
  if (width < 2 || height < 2 || width * height > 80_000) return null;
  const lightInk = colors.some((color) => colorBrightness(color) > 190);
  function matches(x, y) {
    const current = pixelColor(image, x, y);
    return current.a >= 160 && colors.some((color) => colorDistance(current, color) <= (colorBrightness(color) > 190 ? 70 : 58));
  }
  const edgeBackground = lightInk ? new Uint8Array(width * height) : null;
  if (edgeBackground) {
    const queue = [];
    function enqueue(x, y) {
      if (x < left || x >= right || y < top || y >= bottom || !matches(x, y)) return;
      const index = (y - top) * width + (x - left);
      if (edgeBackground[index]) return;
      edgeBackground[index] = 1;
      queue.push([x, y]);
    }
    for (let x = left; x < right; x += 1) { enqueue(x, top); enqueue(x, bottom - 1); }
    for (let y = top + 1; y < bottom - 1; y += 1) { enqueue(left, y); enqueue(right - 1, y); }
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (!item) continue;
      const [x, y] = item;
      enqueue(x + 1, y); enqueue(x - 1, y); enqueue(x, y + 1); enqueue(x, y - 1);
    }
  }
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, count = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    if (edgeBackground?.[(y - top) * width + (x - left)]) continue;
    if (!matches(x, y)) continue;
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x + 1); y2 = Math.max(y2, y + 1); count += 1;
  }
  if (count < 8 || !Number.isFinite(x1) || count / Math.max(1, width * height) > 0.68) return null;
  const ink = pxToPtBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, image, slideSize);
  const sizePt = Number(textBox.font?.sizePt);
  const padX = Number.isFinite(sizePt) ? Math.max(0.6, Math.min(2.2, sizePt * 0.14)) : 1.2;
  const padY = Number.isFinite(sizePt) ? Math.max(0.25, Math.min(1.2, sizePt * 0.08)) : 0.6;
  const target = {
    x: Math.max(0, ink.x - padX),
    y: Math.max(0, ink.y - padY),
    w: Math.min(slideSize.widthPt - Math.max(0, ink.x - padX), ink.w + padX * 2),
    h: Math.min(slideSize.heightPt - Math.max(0, ink.y - padY), ink.h + padY * 2)
  };
  const allowRichRunEvidenceShrink = Array.isArray(textBox.runs) && Number(textBox.source?.mixedColorTextRuns || 0) >= 2;
  if (!qualityBox && textBox.source?.evidenceBox && !allowRichRunEvidenceShrink) {
    const evidence = textBox.source.evidenceBox;
    const x1 = Math.max(0, Math.min(target.x, evidence.x));
    const y1 = Math.max(0, Math.min(target.y, evidence.y));
    const x2 = Math.min(slideSize.widthPt, Math.max(target.x + target.w, evidence.x + evidence.w));
    const y2 = Math.min(slideSize.heightPt, Math.max(target.y + target.h, evidence.y + evidence.h));
    target.x = x1; target.y = y1; target.w = x2 - x1; target.h = y2 - y1;
  }
  if (target.w < 2 || target.h < 2) return null;
  const current = textBox.box;
  const movement = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.w - current.w) * 0.5 + Math.abs(target.h - current.h) * 0.5;
  if (movement < 0.2 || movement > Math.max(16, Math.max(current.w, current.h) * 1.05)) return null;
  return { box: target, movement };
}

function sourceTextInkColors(textBox) {
  const colors = [];
  const base = hexColor(textBox?.font?.color);
  if (base) colors.push(base);
  if (Array.isArray(textBox?.runs)) {
    for (const run of textBox.runs) {
      const color = hexColor(run?.font?.color);
      if (!color) continue;
      if (!colors.some((existing) => colorDistance(existing, color) < 1)) colors.push(color);
    }
  }
  return colors.slice(0, 8);
}

function fitDeckWorstTextInkBoxes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority)) continue;
      const fit = findSourceTextInkBox(textBox, image, next.slideSize);
      if (!fit) continue;
      candidates.push({ pageIndex, index, fit, priority, score: fit.movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    textBox.box = item.fit.box;
    textBox.style = { ...(textBox.style || {}), marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink" };
    textBox.source = { ...(textBox.source || {}), finalWorstTextInkBoxFit: { provider: "worker-final-worst-text-ink-box-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextInkBoxFit: { provider: "worker-final-worst-text-ink-box-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function fitDeckWorstTextComposite(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetScale = Number.isFinite(options.targetScale) ? Math.max(0.92, Math.min(1.10, options.targetScale)) : 1;
  const deltaYPt = Number.isFinite(options.deltaYPt) ? Math.max(-1.2, Math.min(1.2, options.deltaYPt)) : 0;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const textBoxes = Array.isArray(next.pages[pageIndex]?.textBoxes) ? next.pages[pageIndex].textBoxes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const textBox = textBoxes[index];
      const priority = priorityIds.get(`${pageIndex}:${textBox?.id}`);
      if (!Number.isSafeInteger(priority) || !isFiniteBox(textBox?.box)) continue;
      const sizePt = Number(textBox?.font?.sizePt);
      if (!Number.isFinite(sizePt) || sizePt < 5 || sizePt > 24) continue;
      const textLength = Array.from(String(textBox.text || "").trim()).length;
      if (textLength < 1 || textLength > 180) continue;
      const ink = findSourceTextInkBox(textBox, image, next.slideSize);
      const box = ink?.box ? { ...ink.box } : { ...textBox.box };
      if (deltaYPt !== 0) {
        const nextY = box.y + deltaYPt;
        if (!Number.isFinite(nextY) || nextY < 0 || nextY + box.h > Number(next.slideSize?.heightPt || 0) + 1) continue;
        box.y = nextY;
      }
      const scaleMovement = Math.abs(targetScale - 1) * Math.max(1, textLength);
      const movement = (ink?.movement || 0) + Math.abs(deltaYPt) + scaleMovement;
      if (movement < 0.05) continue;
      candidates.push({ pageIndex, index, priority, score: movement, box, scale: targetScale, deltaYPt, usedInkBox: Boolean(ink) });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const textBox = next.pages[item.pageIndex].textBoxes[item.index];
    textBox.box = item.box;
    if (item.scale !== 1) {
      textBox.font = { ...(textBox.font || {}), sizePt: Number(textBox.font?.sizePt) * item.scale };
    }
    textBox.style = { ...(textBox.style || {}), marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink" };
    textBox.source = {
      ...(textBox.source || {}),
      finalWorstTextCompositeFit: {
        provider: "worker-final-worst-text-composite-fit-v1",
        scale: item.scale,
        deltaYPt: item.deltaYPt,
        usedInkBox: item.usedInkBox
      }
    };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalWorstTextCompositeFit: { provider: "worker-final-worst-text-composite-fit-v1", changedTextBoxes: selected.length, candidateTextBoxes: candidates.length, scale: targetScale, deltaYPt } };
  }
  return { deck: next, changedTextBoxes: selected.length, candidateTextBoxes: candidates.length };
}

function sourceLightCardTextAnchorGeometry(shape, textBoxes, slideSize) {
  if (shape?.source?.detector !== "line-text-native-card-row" || !shape?.box || !shape?.style || !slideSize) return null;
  const fill = hexColor(shape.style.fill);
  const stroke = hexColor(shape.style.stroke);
  if (!fill || !stroke || colorBrightness(fill) < 238 || colorBrightness(stroke) < 220 || colorDistance(fill, stroke) > 42) return null;
  const shapeBox = shape.box;
  const texts = (Array.isArray(textBoxes) ? textBoxes : [])
    .filter((textBox) => isFiniteBox(textBox?.box))
    .filter((textBox) => {
      const box = textBox.box;
      const centerX = box.x + box.w / 2;
      const centerY = box.y + box.h / 2;
      return centerX >= shapeBox.x && centerX <= shapeBox.x + shapeBox.w
        && centerY >= shapeBox.y && centerY <= shapeBox.y + shapeBox.h
        && box.h >= 7 && box.h <= 22 && box.w >= 12;
    });
  if (texts.length < 2 || texts.length > 4) return null;
  const minX = Math.min(...texts.map((textBox) => textBox.box.x));
  const minY = Math.min(...texts.map((textBox) => textBox.box.y));
  const maxX = Math.max(...texts.map((textBox) => textBox.box.x + textBox.box.w));
  const maxY = Math.max(...texts.map((textBox) => textBox.box.y + textBox.box.h));
  const textWidth = maxX - minX;
  const textHeight = maxY - minY;
  if (!Number.isFinite(textWidth) || !Number.isFinite(textHeight) || textWidth < 36 || textHeight < 18) return null;
  const leftPad = Math.max(5, Math.min(10, shapeBox.w * 0.06));
  const rightInset = leftPad;
  const topPad = Math.max(10, Math.min(18, shapeBox.h * 0.26));
  const verticalPad = Math.max(24, Math.min(34, shapeBox.h * 0.55));
  const box = clampSlideBox({
    x: minX - leftPad,
    y: minY - topPad,
    w: Math.max(1, textWidth + leftPad - rightInset),
    h: Math.max(1, textHeight + verticalPad)
  }, slideSize);
  if (!box || box.w < 38 || box.h < 24 || box.h > 92) return null;
  const movement = Math.abs(box.x - shapeBox.x) + Math.abs(box.y - shapeBox.y) + Math.abs(box.w - shapeBox.w) * 0.5 + Math.abs(box.h - shapeBox.h) * 0.5;
  if (movement < 0.4 || movement > Math.max(40, Math.max(shapeBox.w, shapeBox.h) * 0.55)) return null;
  return { box, movement, fittedEdges: 2, provider: "text-anchor" };
}

function sourceTextFidelityPrimitiveRuns({ textBox, source, rendered, slideSize, maximumRuns, currentRuns }) {
  if (!textBox?.box || !source || !rendered || !slideSize) return { shapes: [], skippedRuns: 0 };
  const reference = componentQualityReferenceBox(textBox) || textBox.source?.evidenceBox || textBox.box;
  if (!reference || !Number.isFinite(reference.x) || !Number.isFinite(reference.y) || !Number.isFinite(reference.w) || !Number.isFinite(reference.h)) return { shapes: [], skippedRuns: 0 };
  const scaleX = source.width / slideSize.widthPt; const scaleY = source.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((reference.x - 1) * scaleX));
  const top = Math.max(0, Math.floor((reference.y - 1) * scaleY));
  const right = Math.min(source.width, Math.ceil((reference.x + reference.w + 1) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((reference.y + reference.h + 1) * scaleY));
  if (right <= left || bottom <= top || (right - left) * (bottom - top) > 120_000) return { shapes: [], skippedRuns: 0 };
  const runs = [];
  let skippedRuns = 0;
  const remainingRuns = maximumRuns - currentRuns;
  if (remainingRuns < 1) return { shapes: [], skippedRuns };
  for (let y = top; y < bottom; y += 1) {
    let x = left;
    while (x < right) {
      const offset = (y * source.width + x) * 4;
      const delta = sourceRenderedDelta(source, rendered, x, y);
      if (!sourceTextFidelityForeground(source, offset) || delta <= TEXT_FIDELITY_DELTA_THRESHOLD) {
        x += 1;
        continue;
      }
      const fill = sourcePixelHex(source, x, y);
      const start = x;
      let score = delta;
      x += 1;
      while (x < right) {
        const nextOffset = (y * source.width + x) * 4;
        const nextDelta = sourceRenderedDelta(source, rendered, x, y);
        if (!sourceTextFidelityForeground(source, nextOffset) || nextDelta <= TEXT_FIDELITY_DELTA_THRESHOLD || sourcePixelHex(source, x, y) !== fill) break;
        score += nextDelta;
        x += 1;
      }
      const length = x - start;
      runs.push({ start, y, length, fill, score });
    }
  }
  const merged = mergeVerticalTextPrimitiveRuns(runs, scaleX, scaleY, String(textBox.id || ""), remainingRuns);
  return { shapes: merged.shapes, skippedRuns: skippedRuns + merged.skippedRuns };
}

function mergeVerticalTextPrimitiveRuns(runs, scaleX, scaleY, sourceTextId, limit) {
  const merged = [];
  const active = new Map();
  let order = 0;
  for (const run of runs) {
    const key = `${run.start}:${run.length}:${run.fill}`;
    const current = active.get(key);
    if (current && current.lastY === run.y - 1) {
      current.lastY = run.y;
      current.score += Number(run.score || 0);
      continue;
    }
    if (current) merged.push(current);
    active.set(key, { start: run.start, length: run.length, fill: run.fill, firstY: run.y, lastY: run.y, score: Number(run.score || 0), order: order++ });
  }
  for (const current of active.values()) merged.push(current);
  const selectable = [];
  let skippedRuns = 0;
  for (const run of merged) {
    const height = run.lastY - run.firstY + 1;
    if (run.length < 2 && height < 2) {
      skippedRuns += 1;
      continue;
    }
    selectable.push({
      type: "rect",
      box: { x: run.start / scaleX, y: run.firstY / scaleY, w: run.length / scaleX, h: height / scaleY },
      style: { fill: run.fill },
      sourceTextId,
      score: Number(run.score || 0),
      order: run.order
    });
  }
  const shapes = selectable
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, Math.max(0, limit))
    .sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x || left.box.w - right.box.w)
    .map(({ score: _score, order: _order, ...shape }) => shape);
  return { shapes, skippedRuns };
}

function sourceTextFidelityForeground(image, offset) {
  const color = { r: image.rgba[offset], g: image.rgba[offset + 1], b: image.rgba[offset + 2], a: image.rgba[offset + 3] };
  if (color.a < 128) return false;
  const brightnessValue = colorBrightness(color);
  const saturationValue = saturationProxy(color);
  return brightnessValue < 245 && (brightnessValue < 210 || saturationValue > 18);
}

function fitDeckTextFidelityPrimitives(deck, options = {}) {
  const next = structuredClone(deck);
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const renderedImages = Array.isArray(options.renderedImages) ? options.renderedImages : [];
  const maximumRuns = Number.isSafeInteger(options.maximumRuns) && options.maximumRuns > 0 ? Math.min(options.maximumRuns, TEXT_FIDELITY_PRIMITIVE_MAX_RUNS) : 1600;
  let addedShapes = 0; let skippedRuns = 0; let candidateTextBoxes = 0;
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    if (addedShapes >= maximumRuns) break;
    const page = next.pages[pageIndex];
    const textBoxes = Array.isArray(page?.textBoxes) ? page.textBoxes : [];
    if (textBoxes.length < 1 || !sourceImages[pageIndex] || !renderedImages[pageIndex]) continue;
    const source = readPng(sourceImages[pageIndex]);
    const rendered = readPng(renderedImages[pageIndex]);
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    for (const textBox of textBoxes) {
      if (addedShapes >= maximumRuns) break;
      const runs = sourceTextFidelityPrimitiveRuns({ textBox, source, rendered, slideSize: next.slideSize, maximumRuns, currentRuns: addedShapes });
      skippedRuns += runs.skippedRuns;
      if (runs.shapes.length < 1) continue;
      candidateTextBoxes += 1;
      for (const run of runs.shapes) {
        page.shapes.push({
          id: `text-fidelity-native-run-${pageIndex + 1}-${addedShapes + 1}`,
          type: "rect",
          box: run.box,
          style: run.style,
          source: {
            detector: "text-fidelity-native-primitive",
            componentQualityIgnore: true,
            sourceTextId: run.sourceTextId
          }
        });
        addedShapes += 1;
      }
    }
  }
  if (addedShapes > 0) {
    next.meta = { ...(next.meta || {}), finalTextFidelityPrimitiveFit: { provider: "worker-final-text-fidelity-primitive-fit-v1", addedShapes, candidateTextBoxes, skippedRuns: Math.min(skippedRuns, 100_000), skippedRunsTruncated: skippedRuns > 100_000 } };
  }
  return { deck: next, addedShapes, candidateTextBoxes, skippedRuns };
}

function assertTextRefinementResult(refined) {
  if (!refined || typeof refined.accepted !== "boolean" || !Number.isSafeInteger(refined.skippedPixelBudget)
    || refined.skippedPixelBudget < 0 || refined.skippedPixelBudget > 1_600_000_000) throw new Error("text refinement returned an invalid result");
}

function visibleVisualFallbackTextBoxes(page) {
  return (Array.isArray(page?.textBoxes) ? page.textBoxes : []).map((textBox) => ({
    ...textBox,
    font: { ...(textBox.font || {}), opacity: textBox.font?.opacity === 0 ? 1 : textBox.font?.opacity },
    style: { ...(textBox.style || {}), opacity: textBox.style?.opacity === 0 ? 1 : textBox.style?.opacity, visibility: "visible" },
    source: { ...(textBox.source || {}), editable: true, overlayVisibility: "visible-visual-fallback" }
  }));
}

async function refineNativeOnlyResidualCandidateText(request) {
  return refineNativeOnlyTextCandidate(request);
}

async function refineNativeOnlyResidualCandidateTextGeometry({ nativeOnlyCandidate, root, rawImageTextRefiner, sourceImages, runBuild, rawImageQualityVerifier, isCancellationRequested }) {
  if (!nativeOnlyCandidate || nativeOnlyCandidate.rejected === true || typeof rawImageTextRefiner !== "function"
    || !Array.isArray(nativeOnlyCandidate.renderedImages) || nativeOnlyCandidate.renderedImages.length < 1
    || !shouldTryNativeOnlyPrePolicyTextRefinement(nativeOnlyCandidate.quality)) {
    return nativeOnlyCandidate;
  }
  const renderedImagesByPptxFile = new Map();
  const refined = await rawImageTextRefiner({
    root,
    deckFile: nativeOnlyCandidate.deckFile,
    pptxFile: nativeOnlyCandidate.pptxFile,
    deck: nativeOnlyCandidate.deck,
    sourceImages,
    renderedImages: nativeOnlyCandidate.renderedImages,
    initialQuality: nativeOnlyCandidate.quality,
    isCancellationRequested,
    acceptImprovedFailure: true,
    candidateSpecLimit: 1,
    buildCandidate: ({ deckFile, pptxFile }) => runBuild({ deckFile, pptxFile }),
    verifyCandidate: async ({ deck, pptxFile }) => {
      const renderedImages = [];
      const quality = await rawImageQualityVerifier({
        root,
        pptxFile,
        sourceImages,
        deck,
        isCancellationRequested,
        collectRenderedPages: (pages) => { renderedImages.push(...pages); }
      });
      renderedImagesByPptxFile.set(pptxFile, renderedImages);
      return quality;
    }
  });
  assertTextRefinementResult(refined);
  const metrics = {
    ...(nativeOnlyCandidate.quality?.metrics || {}),
    "native-only-pre-policy-text-refinement-accepted": Number(refined.accepted),
    "native-only-pre-policy-text-refinement-proposed-boxes": refined.changedTextBoxes,
    ...(refined.skippedPixelBudget ? { "native-only-pre-policy-text-refinement-skipped-pixel-budget": refined.skippedPixelBudget } : {})
  };
  if (!refined.accepted) {
    return { ...nativeOnlyCandidate, quality: { ...nativeOnlyCandidate.quality, metrics } };
  }
  return {
    ...nativeOnlyCandidate,
    deck: refined.deck,
    deckFile: refined.deckFile,
    pptxFile: refined.pptxFile,
    quality: {
      ...refined.quality,
      metrics: {
        ...(refined.quality?.metrics || {}),
        "native-only-pre-policy-text-refinement-accepted": 1,
        "native-only-pre-policy-text-refinement-proposed-boxes": refined.changedTextBoxes,
        ...(refined.skippedPixelBudget ? { "native-only-pre-policy-text-refinement-skipped-pixel-budget": refined.skippedPixelBudget } : {})
      }
    },
    renderedImages: renderedImagesByPptxFile.get(refined.pptxFile) || []
  };
}

module.exports = { searchLegacyTexts, selectOcrRecovery, refineNativeOnlyTextCandidate, adoptOcrRecovery, mergeRecoveredOcrTextForFallback, deckHasRecoveredOcrText, countRecoveredOcrTextBoxes, finalOcrEvidenceCandidateLimits, worstTextScaleCandidates, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates, richOcrTextLayoutScaleCandidates, richOcrTextLayoutHeightScales, earlyWorstTextCompositeScaleCandidates, earlyWorstTextCompositeNudgeCandidates, earlyWorstTextCompositeCandidateLimits, editableTextFontFamilyCandidates, focusedEditableTextFontFamilyCandidates, focusedEditableTextFontFamilyCandidateLimits, fitDeckEditableTextFontFamily, fitDeckOcrEvidenceToSource, beforeTextBoxId, compactDeckLateTextSourceBudgetProvenance, fitDeckWorstTextScale, fitDeckWorstTextBoxNudge, fitDeckWorstTextWeight, fitDeckWorstRichOcrTextLayout, isRichOcrSingleLineTextBox, segmentedOcrLayoutMaxHeightPt, scaleFontSize, sourceTextInkColor, fitDeckWorstTextColors, fitDeckWorstTextArrowGlyphs, isRightArrowGlyphText, findSourceTextInkBox, sourceTextInkColors, fitDeckWorstTextInkBoxes, fitDeckWorstTextComposite, sourceLightCardTextAnchorGeometry, sourceTextFidelityPrimitiveRuns, mergeVerticalTextPrimitiveRuns, sourceTextFidelityForeground, fitDeckTextFidelityPrimitives, assertTextRefinementResult, visibleVisualFallbackTextBoxes, refineNativeOnlyResidualCandidateText, refineNativeOnlyResidualCandidateTextGeometry };
