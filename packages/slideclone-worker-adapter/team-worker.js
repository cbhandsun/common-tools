"use strict";

const { safeAssetPath, validateDeckIr, admitRebuiltPage } = require("../slideclone-core/deck-ir-admission");

const { admitTemplateBuild } = require("../slideclone-core/template-build-admission");
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES, prepareDeliveryArtifacts, readDeliveryArtifact } = require("../artifact-core");
const { run: runProcess } = require("../slideclone-core/renderer-process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAX_ARCHIVE_BYTES, extractProjectArchive } = require("../archive-core");
const { assertQualityReport } = require("../capability-contracts");
const { auditNativeComponentQuality, largeRasterEditability, nativeObjectMetrics, ocrRecoveryCandidateScopes, qualityRendered, assessOcrRecovery, shouldStopOcrRecoverySearch, tileLargeReconstructionRasters, visualQualityDoesNotRegress, writeTextErasedVisualFallbackAsset } = require("../slideclone-core/team-native-rebuild");
const { auditSemanticEditability } = require("../slideclone-core/semantic-editability-quality");
const { orderSourceIconLayers } = require("../slideclone-core/source-icon-layer-order");
const { dropLineTextCoveredForegroundCrops } = require("../slideclone-core/page-output-rules");
const { createStrictNativeCandidatePolicy, hasMeasuredVisualGain, createFinalRefinementQualityPolicy, createOcrRecoverySelection } = require("./candidate-quality-policy");
const { createProvisionalNativeSearch } = require("./provisional-native-search");
const { createLegacyTextSearch, textFontFamilyMatches, replaceTextFontFamily } = require("./legacy-text-search");
const { createNativeOnlyShadowSession } = require("./native-only-shadow-session");
const { createNativeUnderlayRemovalProposal } = require("./native-underlay-removal-proposal");
const proposeNativeUnderlayRemoval = createNativeUnderlayRemovalProposal({ largeRasterEditability });
const { createNativeOnlyStrokeRefiner, createNativeOnlyMissingRefiner, proposeNativeOwnedGraphics } = require("./native-only-refinement");
const { createPictorialCandidateBuilder } = require("./pictorial-candidate-transaction");
const tryBuildNativeOnlyPictorialIconCandidate = createPictorialCandidateBuilder({ replace: replacePictorialIconCropsWithNativeShapes, validateDeck: validateDeckIr, semanticChecksPass: nativeOnlySemanticChecksPass, doesNotRegress: nativeOnlyRefinementDoesNotMateriallyRegress, raster: largeRasterEditability });
const { assertEditableInputDocument } = require("../slideclone-core/document-input");
const { QUALITY_GATE_REQUIRED } = require("../team-runtime/worker-completion");
const { WorkerFailure } = require("../team-runtime/worker-failure");
const { createBudgetedWorkerHandler, budgetedQualityVerifier, remainingWorkerTimeout, runWorkerStage, recordWorkerCandidateDecision, recordWorkerSearchDecision } = require("./worker-budget-runner");
const searchLegacyTexts = createLegacyTextSearch({ recordSearch: recordWorkerSearchDecision, fontFamilies: focusedEditableTextFontFamilyCandidates() });
const { createOcrCheckpoint } = require("./ocr-checkpoint");
const { admitOcrResult } = require("../slideclone-core/ocr-result-admission");
const { admitRebuiltPageMetadata } = require("../slideclone-core/rebuilt-page-metadata");
const { admitNormalizedPages } = require("../slideclone-core/normalized-pages-admission");
const { readPng, writePng } = require("../slideclone-core/png");
const { extractVisualAtoms } = require("../slideclone-core/visual-atoms");
const { visualAtomNativeShape } = require("../slideclone-core/visual-atom-native-shapes");
const { vectorizeDensePictorialIcon } = require("../slideclone-core/pictorial-icon-native-vectorization");
const { traceSparseConnectorContours, estimateSparseConnectorInkColor } = require("../slideclone-core/sparse-connector-contours");
const { createMissingBlobComponentCollector, missingBlobTargetTouchesText } = require("../slideclone-core/missing-blob-components");
const connectedMissingNativeBlobComponents = createMissingBlobComponentCollector({
  summarizeColor: (colors,density) => rgbToHex((density <= 0.18 ? estimateSparseConnectorInkColor(colors) : dominantColor(colors)) || colors[0]),
  describeGeometry: (pixels,bounds,density) => ({
    points: simplifyHullPoints(convexHull(pixels.map(pixel => ({x:(pixel.x-bounds.x)/Math.max(1,bounds.w-1),y:(pixel.y-bounds.y)/Math.max(1,bounds.h-1)}))),18)
      .map(point=>({x:round(Math.max(0,Math.min(1,point.x))),y:round(Math.max(0,Math.min(1,point.y)))})),
    curve: sparseCurveControlPoints(pixels,bounds.x,bounds.y,bounds.w,bounds.h),
    connectorContour: density<=0.18 ? traceSparseConnectorContours(pixels,bounds) : null
  })
});
const { traceDiagonalConnectorFromRaster } = require("../slideclone-core/diagonal-connector-contours");
const { textWeightCandidateTargets } = require("../slideclone-core/text-weight-candidate-targets");
const { planEvidenceTextWeightFit } = require("../slideclone-core/text-weight-evidence");
const { planMeasuredSingleLineTextFit } = require("../slideclone-core/measured-text-fit");
const { rollbackRegressedNativeTexts } = require("./text-candidate-rollback");
const { isSpatialMissingComponent, sharedMissingComponentRegression } = require("./missing-component-regression");
const { admitsSemanticPanelFill } = require("./semantic-panel-fill-policy");
const { clusterLightPanelBins } = require("./light-panel-color-cluster");
const { fitSourceLightPanelGeometry } = require("./source-light-panel-geometry");
const { planRedundantPanelBackgrounds } = require("./redundant-panel-backgrounds");
const { createNativeOnlyPanelRefiner } = require("./native-only-panel-refinement");
const { createNativeOnlyTextRefiner } = require("./native-only-text-refinement");
const { fitHighConfidenceSingleLineOcrToEvidence } = require("../slideclone-core/text-box-micro-adjust");
const { readZipEntries } = require("../slideclone-core/pptx-zip");

const { createArchiveAdmission, IMAGE_EXTENSIONS, MAX_DECK_BYTES } = require("../slideclone-core/archive-admission");
const { validatePackage, validateDocumentPackage, readRawImageDimensions } = createArchiveAdmission(assertEditableInputDocument);
const selectOcrRecovery = createOcrRecoverySelection({ assess: assessOcrRecovery, recordDecision: recordWorkerCandidateDecision });
const finalRefinementQualityAcceptable = createFinalRefinementQualityPolicy({ sharedWorstComponentRegression, recordDecision: recordWorkerCandidateDecision });
const refineNativeOnlyPanels = createNativeOnlyPanelRefiner({ readPng, fitGeometry: fitDeckLightCardGeometry,
  fitFills: fitDeckLowSaturationPanelFills, validateDeck: validateDeckIr, auditSemantic: auditSemanticEditability,
  qualityRendered, qualityAcceptable: finalRefinementQualityAcceptable, maxPptxBytes: MAX_PPTX_BYTES });
const refineNativeOnlyTextCandidate = createNativeOnlyTextRefiner({ refineGeometry: refineNativeOnlyResidualCandidateTextGeometry,
  validateDeck: validateDeckIr, auditSemantic: auditSemanticEditability, auditComponents: auditNativeComponentQuality,
  qualityRendered, qualityAcceptable: finalRefinementQualityAcceptable, maxPptxBytes: MAX_PPTX_BYTES });
const refineNativeOnlyResidualCandidateMissingNativeLines = createNativeOnlyMissingRefiner({ qualityRendered, fitDeckMissingNativeVisualAtomShapes, nativeOnlyMissingNativeTargetBudgets, validateDeckIr, changedComponentKeysFromFit, nativeOnlyRefinementImproves, targetMissingNativeComponentQualityImproves, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlySemanticChecksPass });
const assessStrictNativeCandidate = createStrictNativeCandidatePolicy({ recordDecision: recordWorkerCandidateDecision,
  assessRasterRemoval: nativeOnlyResidualQualityAcceptable });
const searchProvisionalNativeCandidate = createProvisionalNativeSearch({ assess: assessStrictNativeCandidate, qualityAcceptable: finalRefinementQualityAcceptable, hasMeasuredGain: hasMeasuredVisualGain });
const refineNativeOnlyStrokes = createNativeOnlyStrokeRefiner({ fit: fitDeckNativeShapeThinStrokes,
  priorityIds: quality => componentWorstPriority(quality, { kind: "shape" }), strokeWidthMultipliers: nativeShapeThinStrokeMultipliers,
  candidateLimits: boundedCandidateLimits, validateDeck: validateDeckIr, qualityAcceptable: finalRefinementQualityAcceptable, hasMeasuredGain: hasMeasuredVisualGain });

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function assertObjectStore(objectStore) {
  if (!objectStore || typeof objectStore.readObject !== "function" || typeof objectStore.putObject !== "function") throw new TypeError("team object store does not support worker I/O");
  return objectStore;
}
function residualDeduplicationStatus(deck, residual) {
  const required = Array.isArray(deck?.pages) && deck.pages.some((page) => (Array.isArray(page?.images) ? page.images : []).some((image) => image?.source?.residualCrop === true));
  const candidateObjects = Number.isSafeInteger(residual?.candidateObjects) && residual.candidateObjects >= 0 ? residual.candidateObjects : 0;
  const erasedObjects = Number.isSafeInteger(residual?.erasedObjects) && residual.erasedObjects >= 0 ? residual.erasedObjects : 0;
  return Object.freeze({ required, passed: !required || (candidateObjects > 0 && erasedObjects === candidateObjects), candidateObjects, erasedObjects });
}
function allPagesHaveNativeGraphics(deck) {
  return Array.isArray(deck?.pages) && deck.pages.length > 0 && deck.pages.every((page) => nativeObjectMetrics({ pages: [page] }).graphicalObjects > 0);
}
function namespaceRawPageAssets(deck, pageRoot, root, pageNumber) {
  const sourceAssets = path.join(pageRoot, "assets");
  const namespace = `page-${String(pageNumber).padStart(3, "0")}`;
  const destinationAssets = path.join(root, "assets", namespace);
  const replacements = new Map();
  for (const entry of fs.readdirSync(sourceAssets, { withFileTypes: true })) {
    if (!entry.isFile()) throw new Error("raw image rebuild produced an invalid asset tree");
    const original = `assets/${entry.name}`; const replacement = `assets/${namespace}/${entry.name}`;
    fs.mkdirSync(destinationAssets, { recursive: true }); fs.copyFileSync(path.join(sourceAssets, entry.name), path.join(destinationAssets, entry.name)); replacements.set(original, replacement);
  }
  function rewrite(value) {
    if (Array.isArray(value)) return value.map((item) => rewrite(item));
    if (!value || typeof value !== "object") return typeof value === "string" && replacements.has(value) ? replacements.get(value) : value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]));
  }
  const rewritten=rewrite(deck);
  // Preserve private, immutable source observations across this trusted asset
  // copy. The JSON clone itself carries no candidate or source-pixel authority.
  const {rebindIntactSourceWordLayouts}=require('../slideclone-core/source-word-layout-registry');
  for(let index=0;index<deck.pages.length;index++)rebindIntactSourceWordLayouts(deck.pages[index],rewritten.pages[index],replacements);
  return rewritten;
}
async function rebuildRawImages({ root, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job, ocrResults = new Map(), recoverOcrCropText = false, recoveryScope = null }) {
  const pageDecks = []; const sourceImages = []; const reconstructionProfiles = []; const componentQuality = [];
  let slideSize; let candidateObjects = 0; let erasedObjects = 0; let ocrSourceLines = 0; let ocrRecoveredLines = 0; let ocrCropsErased = 0;
  for (const source of metadata.sources) {
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const pageRoot = path.join(root, ".raw-pages", String(source.pageIndex + 1).padStart(3, "0"));
    fs.mkdirSync(path.join(pageRoot, "assets"), { recursive: true });
    fs.copyFileSync(source.inputFile, path.join(pageRoot, ...source.assetPath.split("/")));
    const runOcr = () => rawImageOcr({ inputFile: source.inputFile, dimensions: source.dimensions, pageIndex: source.pageIndex, isCancellationRequested });
    let ocr = ocrResults.get(source.pageIndex);
    if (!ocr) {
      ocr = await runWorkerStage("IMAGE_OCR_FAILED", async () => admitOcrResult(await (ocrCheckpoint ? ocrCheckpoint({ job, source, runOcr, isCancellationRequested }) : runOcr()), source.dimensions));
      ocrResults.set(source.pageIndex, ocr);
    }
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const rebuilt = await runWorkerStage("IMAGE_REBUILD_FAILED", () => rawImageRebuilder({ root: pageRoot, metadata: source, ocr, pageIndex: source.pageIndex, isCancellationRequested, recoverOcrCropText, ...(recoveryScope ? { recoverOcrCropIds: recoveryScope.pageIndex === source.pageIndex ? [recoveryScope.cropId] : [] } : {}) }));
    let deck = admitRebuiltPage(rebuilt, pageRoot);
    const details = admitRebuiltPageMetadata(rebuilt, { pageRoot, sourceInputFile: source.inputFile });
    if (!slideSize) slideSize = deck.slideSize;
    else if (deck.slideSize?.widthPt !== slideSize.widthPt || deck.slideSize?.heightPt !== slideSize.heightPt) throw new Error("raw image batch sources must have a consistent slide aspect ratio");
    try { deck = namespaceRawPageAssets(deck, pageRoot, root, source.pageIndex + 1); }
    catch (error) { throw new WorkerFailure("IMAGE_ASSET_NAMESPACE_FAILED", { cause: error }); }
    deck.pages[0].pageIndex = source.pageIndex; pageDecks.push(deck.pages[0]); sourceImages.push(details.sourceImage);
    const residual = residualDeduplicationStatus(deck, details.residual);
    if (residual.required && !residual.passed) throw new Error(`native image residual deduplication is incomplete for page ${source.pageIndex + 1}`);
    candidateObjects += residual.candidateObjects; erasedObjects += residual.erasedObjects;
    reconstructionProfiles.push(details.reconstructionProfile);
    if (details.nativeComponentQuality) componentQuality.push(details.nativeComponentQuality);
    ocrSourceLines += details.ocrCropRecovery?.sourceLines || 0;
    ocrRecoveredLines += details.ocrCropRecovery?.recovered || 0;
    ocrCropsErased += details.ocrCropRecovery?.cropsErased || 0;
  }
  const distinctProfiles = new Set(reconstructionProfiles);
  const reconstructionProfile = distinctProfiles.size === 1 && reconstructionProfiles[0] !== null ? reconstructionProfiles[0] : null;
  const deck = { version: "1.0", meta: { source: "team-raw-image-batch", reconstructionMode: "native-hybrid", reconstructionProfile, sourceCount: metadata.sources.length, ocrCropRecovery: { sourceLines: ocrSourceLines, recovered: ocrRecoveredLines, cropsErased: ocrCropsErased } }, slideSize, pages: pageDecks };
  const nativeComponentQuality = componentQuality.length === 0 ? null : {
    passed: componentQuality.length === metadata.sources.length && componentQuality.every((item) => item.passed),
    pagesAudited: componentQuality.length,
    connectors: componentQuality.reduce((sum, item) => sum + (item.metrics?.connectors || 0), 0),
    minimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.minimumUnitCrops || 0), 0),
    evidencedMinimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.evidencedMinimumUnitCrops || 0), 0),
    unverifiedMinimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.unverifiedMinimumUnitCrops || 0), 0),
    ignoredPixelPrimitives: componentQuality.reduce((sum, item) => sum + (item.metrics?.ignoredPixelPrimitives || 0), 0),
  };
  return { deck, sourceImages, residual: { candidateObjects, erasedObjects }, reconstructionProfile, nativeComponentQuality, ocrCropRecovery: { sourceLines: ocrSourceLines, recovered: ocrRecoveredLines, cropsErased: ocrCropsErased } };
}
async function runBuilder({ executable, builderArgs = [], deckFile, outputFile, cwd, timeoutMs, isCancellationRequested }) {
  if (typeof executable !== "string" || !path.isAbsolute(executable)) throw new Error("OpenXML builder executable is invalid");
  if (!Array.isArray(builderArgs) || builderArgs.some((arg) => typeof arg !== "string" || !arg)) throw new TypeError("OpenXML builder arguments are invalid");
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  await admitTemplateBuild({executable, builderArgs, deckFile, cwd, timeoutMs: remainingWorkerTimeout(timeoutMs), isCancellationRequested});
  await runProcess(executable, [...builderArgs, "--ir", deckFile, "--out", outputFile, "--powerpoint-safe", "true"], { cwd, timeout: remainingWorkerTimeout(timeoutMs), maxBuffer: 1024 * 1024, isCancellationRequested });
  assertBuiltPptx(outputFile);
}
function assertBuiltPptx(pptxFile) {
  if (typeof pptxFile !== "string" || !path.isAbsolute(pptxFile)) throw new TypeError("editable builder output path is invalid");
  if (!fs.existsSync(pptxFile) || !fs.statSync(pptxFile).isFile() || fs.statSync(pptxFile).size < 1 || fs.statSync(pptxFile).size > MAX_PPTX_BYTES) {
    throw new Error("editable builder produced an invalid artifact");
  }
  let entries;
  try {
    entries = readZipEntries(fs.readFileSync(pptxFile), { maxArchiveBytes: MAX_PPTX_BYTES, maxEntries: 20000, maxEntryBytes: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error("editable builder produced an invalid PPTX package", { cause: error });
  }
  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has("[Content_Types].xml") || !names.has("ppt/presentation.xml")) {
    throw new Error("editable builder produced an incomplete PPTX package");
  }
}
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
function sameBox(left, right) {
  return ["x", "y", "w", "h"].every((key) => Number(left?.[key]) === Number(right?.[key]));
}
function finalOcrEvidenceCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, 2, 3, 6, 12, count].filter((value) => value <= count))];
}
function boundedCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, 2, 3, 6, 12, count].filter((value) => value <= count))];
}
function fitDeckNativeShapeThinStrokes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const strokeWidthMultiplier = Number.isFinite(options.strokeWidthMultiplier)
    ? Math.max(0.45, Math.min(0.92, Number(options.strokeWidthMultiplier)))
    : 0.75;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const strokeWidthPt = Number(shape?.style?.strokeWidthPt);
      if (shape?.source?.nativeRebuild !== true
        || shape?.type === "line"
        || shape?.style?.stroke === "none"
        || !Number.isFinite(strokeWidthPt)
        || strokeWidthPt <= 0
        || strokeWidthPt > 2.5) continue;
      const box = shape?.box || {};
      const area = Number(box.w || 0) * Number(box.h || 0);
      if (!Number.isFinite(area) || area <= 0) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, priority, score: area * strokeWidthPt });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    const strokeWidthPt = Number(shape.style.strokeWidthPt);
    shape.style = { ...shape.style, strokeWidthPt: Math.max(0.25, Math.round(strokeWidthPt * strokeWidthMultiplier * 100) / 100) };
    shape.source = { ...(shape.source || {}), finalNativeShapeThinStrokeFit: { provider: "worker-final-native-shape-thin-stroke-fit-v1", strokeWidthMultiplier } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalNativeShapeThinStrokeFit: { provider: "worker-final-native-shape-thin-stroke-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length, strokeWidthMultiplier } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
function fitDeckWorstConnectorStyles(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const strokeWidthMultiplier = Number.isFinite(options.strokeWidthMultiplier) && options.strokeWidthMultiplier > 0 ? options.strokeWidthMultiplier : 1;
  const lineCap = typeof options.lineCap === "string" && options.lineCap ? options.lineCap : null;
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const priorityKey = `${pageIndex}:${shape?.id || ""}`;
      const strokeWidthPt = Number(shape?.style?.strokeWidthPt);
      if (priorityIds.size > 0 && !priorityIds.has(priorityKey)) continue;
      if (shape?.type !== "line"
        || shape?.style?.connectorType !== "straight"
        || shape?.style?.stroke === "none"
        || !Number.isFinite(strokeWidthPt)
        || strokeWidthPt <= 0
        || strokeWidthPt > 6
        || !shape?.box
        || (!Number.isFinite(Number(shape.box.w)) && !Number.isFinite(Number(shape.box.h)))) continue;
      const priority = priorityIds.has(priorityKey) ? priorityIds.get(priorityKey) : Number.MAX_SAFE_INTEGER;
      const length = Math.max(Math.abs(Number(shape.box.w) || 0), Math.abs(Number(shape.box.h) || 0));
      if (!Number.isFinite(length) || length < 8) continue;
      candidates.push({ pageIndex, index, priority, score: length * strokeWidthPt });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    const strokeWidthPt = Number(shape.style.strokeWidthPt);
    shape.style = {
      ...shape.style,
      strokeWidthPt: Math.max(0.25, Math.min(8, Math.round(strokeWidthPt * strokeWidthMultiplier * 100) / 100)),
      ...(lineCap ? { lineCap } : {})
    };
    shape.source = { ...(shape.source || {}), finalWorstConnectorStyleFit: { provider: "worker-final-worst-connector-style-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalWorstConnectorStyleFit: {
        provider: "worker-final-worst-connector-style-fit-v1",
        changedShapes: selected.length,
        candidateShapes: candidates.length,
        strokeWidthMultiplier,
        ...(lineCap ? { lineCap } : {})
      }
    };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
function focusedLightCardStrokeWidthCandidates(currentWidthPt = 0.55) {
  const current = Number.isFinite(currentWidthPt) ? currentWidthPt : 0.55;
  return [0.68, 0.8].filter((width) => width > current + 0.02);
}
function focusedCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, Math.min(3, count)].filter((value) => value <= count))];
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
function componentWorstPriority(quality, { role, kind } = {}) {
  const priorities = new Map();
  const rows = Array.isArray(quality?.componentWorst) ? quality.componentWorst : [];
  for (const item of rows) {
    if (!Number.isSafeInteger(item?.pageIndex) || typeof item.id !== "string" || !item.id) continue;
    if (role && item.role !== role) continue;
    if (kind && item.kind !== kind) continue;
    const key = `${item.pageIndex}:${item.id}`;
    if (!priorities.has(key)) priorities.set(key, priorities.size);
  }
  return priorities;
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

function sharedWorstComponentRegression({ baselineQuality, candidateQuality }) {
  const before = componentSeverityByKey(baselineQuality);
  if (before.size === 0) return 0;
  let regression = sharedMissingComponentRegression(baselineQuality?.componentWorst, candidateQuality?.componentWorst,
    candidateQuality?.componentReferenceMetrics, baselineQuality?.componentReferenceMetrics);
  for (const item of Array.isArray(candidateQuality?.componentWorst) ? candidateQuality.componentWorst : []) {
    if (isSpatialMissingComponent(item)) continue;
    const key = componentWorstKey(item);
    if (!key || !before.has(key) || !Number.isFinite(item.severity)) continue;
    regression = Math.max(regression, item.severity - before.get(key));
  }
  return regression;
}
function componentWorstByKey(quality) {
  const result = new Map();
  for (const item of Array.isArray(quality?.componentWorst) ? quality.componentWorst : []) {
    const key = componentWorstKey(item);
    if (!key) continue;
    const current = result.get(key);
    if (!current || Number(item.severity || 0) > Number(current.severity || 0)) result.set(key, item);
  }
  return result;
}
function componentLocalByKey(quality) {
  const result = new Map();
  for (const item of Array.isArray(quality?.componentLocalMetrics) ? quality.componentLocalMetrics : []) {
    const key = componentWorstKey(item);
    if (!key) continue;
    const current = result.get(key);
    if (!current || Number(item.severity || 0) > Number(current.severity || 0)) result.set(key, item);
  }
  return result;
}
function componentQualityByKey(quality) {
  const result = componentWorstByKey(quality);
  for (const [key, item] of componentLocalByKey(quality)) result.set(key, item);
  return result;
}
function componentSeverityByKey(quality) {
  const result = new Map();
  for (const item of Array.isArray(quality?.componentWorst) ? quality.componentWorst : []) {
    const key = componentWorstKey(item);
    if (!key || !Number.isFinite(item.severity)) continue;
    const current = result.get(key);
    result.set(key, Number.isFinite(current) ? Math.max(current, item.severity) : item.severity);
  }
  return result;
}
function componentWorstKey(item) {
  if (!Number.isSafeInteger(item?.pageIndex) || typeof item.id !== "string" || !item.id) return null;
  return `${item.pageIndex}:${item.id}`;
}
function changedComponentKeysFromFit(fitted, priorityIds = new Map()) {
  const keys = Array.isArray(fitted?.changedComponentKeys) ? fitted.changedComponentKeys.filter((key) => typeof key === "string" && key) : [];
  if (keys.length > 0) return new Set(keys);
  return priorityIds instanceof Map ? new Set(priorityIds.keys()) : new Set();
}
function componentMetric(value, name) {
  if (!value || typeof value !== "object") return Number.NaN;
  if (Number.isFinite(value[name])) return value[name];
  if (name === "pixelDiffRatio" && Number.isFinite(value.pixelDiff)) return value.pixelDiff;
  if (name === "foregroundMissingRatio" && Number.isFinite(value.foregroundMissing)) return value.foregroundMissing;
  return Number.NaN;
}
function targetComponentQualityImproves({ baselineQuality, candidateQuality, targetKeys }) {
  const targets = targetKeys instanceof Set ? targetKeys : new Set(Array.isArray(targetKeys) ? targetKeys : []);
  if (targets.size < 1) return false;
  const before = componentQualityByKey(baselineQuality);
  if (before.size < 1) return false;
  const after = componentQualityByKey(candidateQuality);
  let evaluated = 0;
  let improved = false;
  for (const key of targets) {
    const baseline = before.get(key);
    if (!baseline) continue;
    evaluated += 1;
    const candidate = after.get(key);
    if (!candidate) {
      return false;
    }
    const beforeSeverity = componentMetric(baseline, "severity");
    const afterSeverity = componentMetric(candidate, "severity");
    if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity)) {
      if (afterSeverity > beforeSeverity + 0.02) return false;
      if (afterSeverity < beforeSeverity - 0.08) improved = true;
    }
    const beforePixel = componentMetric(baseline, "pixelDiffRatio");
    const afterPixel = componentMetric(candidate, "pixelDiffRatio");
    if (Number.isFinite(beforePixel) && Number.isFinite(afterPixel)) {
      if (afterPixel > beforePixel + 0.005) return false;
      if (afterPixel < beforePixel - 0.005) improved = true;
    }
    const beforeMissing = componentMetric(baseline, "foregroundMissingRatio");
    const afterMissing = componentMetric(candidate, "foregroundMissingRatio");
    if (Number.isFinite(beforeMissing) && Number.isFinite(afterMissing)) {
      if (afterMissing > beforeMissing + 0.005) return false;
      if (afterMissing < beforeMissing - 0.005) improved = true;
    }
    if (baseline.attention === true && candidate.attention !== true) improved = true;
  }
  return evaluated > 0 && improved;
}
function targetMissingNativeComponentQualityImproves({ baselineQuality, candidateQuality, targetKeys }) {
  const targets = targetKeys instanceof Set ? targetKeys : new Set(Array.isArray(targetKeys) ? targetKeys : []);
  if (targets.size < 1) return false;
  const before = componentQualityByKey(baselineQuality);
  if (before.size < 1) return false;
  const after = componentQualityByKey(candidateQuality);
  let evaluated = 0;
  let improved = false;
  for (const key of targets) {
    const baseline = before.get(key);
    if (!baseline || baseline.kind !== "missing" || baseline.role !== "missing-native-component") continue;
    evaluated += 1;
    const candidate = after.get(key);
    if (!candidate) {
      if (!candidateMissingTargetDisappearedWithGlobalImprovement({ baselineQuality, candidateQuality })) return false;
      improved = true;
      continue;
    }
    if (candidate.kind !== "missing" || candidate.role !== "missing-native-component") {
      if (!candidateMissingTargetDisappearedWithGlobalImprovement({ baselineQuality, candidateQuality })) return false;
      improved = true;
      continue;
    }
    const beforeSeverity = componentMetric(baseline, "severity");
    const afterSeverity = componentMetric(candidate, "severity");
    if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity)) {
      if (afterSeverity > beforeSeverity + 0.02) return false;
      if (afterSeverity < beforeSeverity - 0.08) improved = true;
    }
    const beforePixel = componentMetric(baseline, "pixelDiffRatio");
    const afterPixel = componentMetric(candidate, "pixelDiffRatio");
    if (Number.isFinite(beforePixel) && Number.isFinite(afterPixel)) {
      if (afterPixel > beforePixel + 0.005) return false;
      if (afterPixel < beforePixel - 0.005) improved = true;
    }
    const beforeMissing = componentMetric(baseline, "foregroundMissingRatio");
    const afterMissing = componentMetric(candidate, "foregroundMissingRatio");
    if (Number.isFinite(beforeMissing) && Number.isFinite(afterMissing)) {
      if (afterMissing > beforeMissing + 0.005) return false;
      if (afterMissing < beforeMissing - 0.005) improved = true;
    }
    if (baseline.attention === true && candidate.attention !== true) improved = true;
  }
  return evaluated > 0 && improved;
}

function candidateMissingTargetDisappearedWithGlobalImprovement({ baselineQuality, candidateQuality }) {
  const before = baselineQuality?.metrics || {};
  const after = candidateQuality?.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  if (pixelAfter >= pixelBefore - 0.00005) return false;
  if (missingAfter > missingBefore + 0.0002) return false;
  if (deltaAfter > deltaBefore + 0.02) return false;
  const attentionBefore = Number(before["component-regions-attention"]);
  const attentionAfter = Number(after["component-regions-attention"]);
  if (Number.isFinite(attentionBefore) && Number.isFinite(attentionAfter) && attentionAfter > attentionBefore) return false;
  return true;
}
function clampSlideBox(box, slideSize) {
  if (!box || !slideSize) return null;
  const x1 = Math.max(0, Math.min(slideSize.widthPt, Number(box.x)));
  const y1 = Math.max(0, Math.min(slideSize.heightPt, Number(box.y)));
  const x2 = Math.max(x1, Math.min(slideSize.widthPt, Number(box.x) + Number(box.w)));
  const y2 = Math.max(y1, Math.min(slideSize.heightPt, Number(box.y) + Number(box.h)));
  if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
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
function hexColor(value) {
  const match = /^#([0-9a-f]{6})$/iu.exec(String(value || ""));
  if (!match) return null;
  const numeric = Number.parseInt(match[1], 16);
  return { r: numeric >> 16, g: (numeric >> 8) & 255, b: numeric & 255 };
}
function colorBrightness(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}
function dominantColor(colors) {
  const bins = new Map();
  for (const color of colors) {
    const key = `${color.r >> 4},${color.g >> 4},${color.b >> 4}`;
    const current = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += color.r; current.g += color.g; current.b += color.b; current.count += 1;
    bins.set(key, current);
  }
  let best = null;
  for (const value of bins.values()) if (!best || value.count > best.count) best = value;
  return best ? { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count } : null;
}
function ptToPxBox(box, image, slideSize) {
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor(box.x * scaleX));
  const top = Math.max(0, Math.floor(box.y * scaleY));
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY));
  return right > left && bottom > top ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}
function pxToPtBox(box, image, slideSize) {
  return { x: box.x * slideSize.widthPt / image.width, y: box.y * slideSize.heightPt / image.height, w: box.w * slideSize.widthPt / image.width, h: box.h * slideSize.heightPt / image.height };
}
function pixelColor(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return { r: image.rgba[offset] ?? 0, g: image.rgba[offset + 1] ?? 0, b: image.rgba[offset + 2] ?? 0, a: image.rgba[offset + 3] ?? 0 };
}
function saturatedNativePanelDetector(detector) {
  return new Set([
    "line-text-native-card-row",
    "line-text-native-color-panel",
    "line-text-native-leading-icon-swatch"
  ]).has(String(detector || ""));
}
function fitSaturatedColorPanelToSource(shape, image, slideSize) {
  if (!shape?.box || !image || !slideSize) return null;
  const currentFill = hexColor(shape?.style?.fill);
  if (!currentFill || saturationProxy(currentFill) < 38 || colorBrightness(currentFill) < 35 || colorBrightness(currentFill) > 245) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w * px.h > 2_000_000) return null;
  const pad = Math.max(2, Math.min(96, Math.round(Math.max(px.w, px.h) * 0.65)));
  const scan = {
    x: Math.max(0, px.x - pad),
    y: Math.max(0, px.y - pad)
  };
  scan.w = Math.min(image.width, px.x + px.w + pad) - scan.x;
  scan.h = Math.min(image.height, px.y + px.h + pad) - scan.y;
  if (scan.w < 2 || scan.h < 2 || scan.w * scan.h > 2_000_000) return null;
  const colors = [];
  for (let y = scan.y; y < scan.y + scan.h; y += 1) for (let x = scan.x; x < scan.x + scan.w; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a > 64
      && saturationProxy(color) > 45
      && colorBrightness(color) > 35
      && colorBrightness(color) < 240
      && colorDistance(color, currentFill) <= 78) colors.push(color);
  }
  if (colors.length < Math.max(24, Math.min(px.w * px.h * 0.16, scan.w * scan.h * 0.05))) return null;
  const dominant = dominantColor(colors);
  if (!dominant) return null;
  const seen = new Uint8Array(scan.w * scan.h);
  function localIndex(x, y) { return (y - scan.y) * scan.w + (x - scan.x); }
  function matches(x, y) {
    const color = pixelColor(image, x, y);
    return color.a >= 64
      && saturationProxy(color) >= 42
      && colorBrightness(color) >= 35
      && colorBrightness(color) <= 245
      && colorDistance(color, dominant) <= 62
      && colorDistance(color, currentFill) <= 88;
  }
  const components = [];
  for (let y = scan.y; y < scan.y + scan.h; y += 1) for (let x = scan.x; x < scan.x + scan.w; x += 1) {
    const start = localIndex(x, y);
    if (seen[start] || !matches(x, y)) continue;
    const queue = [[x, y]];
    seen[start] = 1;
    let x1 = x, y1 = y, x2 = x + 1, y2 = y + 1, count = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const [cx, cy] = queue[cursor];
      count += 1; x1 = Math.min(x1, cx); y1 = Math.min(y1, cy); x2 = Math.max(x2, cx + 1); y2 = Math.max(y2, cy + 1);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < scan.x || nx >= scan.x + scan.w || ny < scan.y || ny >= scan.y + scan.h) continue;
        const index = localIndex(nx, ny);
        if (seen[index] || !matches(nx, ny)) continue;
        seen[index] = 1;
        queue.push([nx, ny]);
      }
    }
    const width = x2 - x1;
    const height = y2 - y1;
    if (count < Math.max(24, Math.min(px.w * px.h * 0.12, 220)) || width < Math.max(4, px.w * 0.25) || height < Math.max(4, px.h * 0.35)) continue;
    const overlapX = Math.max(0, Math.min(x2, px.x + px.w) - Math.max(x1, px.x));
    const overlapY = Math.max(0, Math.min(y2, px.y + px.h) - Math.max(y1, px.y));
    const overlapArea = overlapX * overlapY;
    if (overlapArea < Math.max(16, Math.min(px.w * px.h * 0.12, count * 0.2))) continue;
    const centerPenalty = Math.abs((x1 + x2) / 2 - (px.x + px.w / 2)) / Math.max(1, px.w)
      + Math.abs((y1 + y2) / 2 - (px.y + px.h / 2)) / Math.max(1, px.h);
    components.push({ box: { x: x1, y: y1, w: width, h: height }, count, score: overlapArea + count * 0.25 - centerPenalty * 120 });
  }
  const best = components.sort((a, b) => b.score - a.score)[0]?.box;
  if (!best) return null;
  const fitted = pxToPtBox(best, image, slideSize);
  if (fitted.w < Math.max(8, shape.box.w * 0.35) || fitted.h < Math.max(8, shape.box.h * 0.4)
    || fitted.w > shape.box.w * 1.9 || fitted.h > shape.box.h * 1.9) return null;
  return { box: fitted, fill: rgbToHex(dominant) };
}
function fitDeckSaturatedColorPanels(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (!saturatedNativePanelDetector(shape?.source?.detector) || !shape.box || !shape.style) continue;
      const fit = fitSaturatedColorPanelToSource(shape, image, next.slideSize);
      if (!fit) continue;
      const movement = Math.abs(fit.box.x - shape.box.x) + Math.abs(fit.box.y - shape.box.y) + Math.abs(fit.box.w - shape.box.w) + Math.abs(fit.box.h - shape.box.h);
      if (movement < 0.25 && String(shape.style.fill || "").toLowerCase() === fit.fill.toLowerCase()) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fit, priority, score: movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.box = item.fit.box;
    shape.style = { ...shape.style, fill: item.fit.fill, stroke: item.fit.fill };
    shape.source = { ...(shape.source || {}), finalSaturatedColorPanelFit: { provider: "worker-final-saturated-color-panel-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalSaturatedColorPanelFit: { provider: "worker-final-saturated-color-panel-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
function dominantLowSaturationPanelColor(shape, image, slideSize) {
  if (!shape?.box || !image || !slideSize) return null;
  const currentFill = hexColor(shape?.style?.fill);
  if (!currentFill) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w * px.h > 2_000_000) return null;
  const insetX = Math.floor(px.w * 0.08);
  const insetY = Math.floor(px.h * 0.08);
  const left = Math.min(px.x + insetX, px.x + px.w - 1);
  const top = Math.min(px.y + insetY, px.y + px.h - 1);
  const right = Math.max(left + 1, px.x + px.w - insetX);
  const bottom = Math.max(top + 1, px.y + px.h - insetY);
  const bins = new Map();
  let sampled = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a < 160 || colorBrightness(color) < 160 || colorBrightness(color) > 253 || saturationProxy(color) > 70) continue;
    sampled += 1;
    const key = `${color.r >> 3},${color.g >> 3},${color.b >> 3}`;
    const current = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += color.r; current.g += color.g; current.b += color.b; current.count += 1;
    bins.set(key, current);
  }
  if (sampled < Math.max(80, (right - left) * (bottom - top) * 0.2)) return null;
  let best = null;
  for (const value of bins.values()) if (!best || value.count > best.count) best = value;
  const fill = best && best.count >= Math.max(40, sampled * 0.28)
    ? { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count }
    : clusterLightPanelBins({ bins: [...bins.values()], sampled });
  if (!fill) return null;
  if (colorDistance(fill, currentFill) < 5 || colorDistance(fill, currentFill) > 42) return null;
  return rgbToHex(fill);
}
function fitDeckLowSaturationPanelFills(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  const detectors = new Set(["line-text-native-title-band-panel", "solid-region-native-background", "line-text-native-card-row"]);
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if ((!detectors.has(String(shape?.source?.detector || "")) && !admitsSemanticPanelFill(shape, next.slideSize)) || !shape.box || !shape.style) continue;
      const fill = dominantLowSaturationPanelColor(shape, image, next.slideSize);
      if (!fill) continue;
      const currentFill = hexColor(shape.style.fill);
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fill, priority, score: currentFill ? colorDistance(hexColor(fill), currentFill) : 0 });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, fill: item.fill };
    shape.source = { ...(shape.source || {}), finalLowSaturationPanelFillFit: { provider: "worker-final-low-saturation-panel-fill-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLowSaturationPanelFillFit: { provider: "worker-final-low-saturation-panel-fill-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
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
function fitVerticalLineToSource(shape, image, slideSize) {
  const stroke = hexColor(shape?.style?.stroke);
  if (!stroke || !shape?.box || !image || !slideSize) return null;
  if (Math.abs(Number(shape.box.h || 0)) < 16 || Math.abs(Number(shape.box.w || 0)) > Math.max(1, Math.abs(Number(shape.box.h || 0)) * 0.08)) return null;
  const probe = { x: Number(shape.box.x) - 2, y: Number(shape.box.y), w: 4, h: Number(shape.box.h) };
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((probe.x - 3) * scaleX));
  const top = Math.max(0, Math.floor((probe.y - 3) * scaleY));
  const right = Math.min(image.width, Math.ceil((probe.x + probe.w + 3) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((probe.y + probe.h + 3) * scaleY));
  const xs = []; const ys = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (lineSourcePixelMatchesStroke(color, stroke)) {
      xs.push(x); ys.push(y);
    }
  }
  if (xs.length < Math.max(20, Math.abs(shape.box.h) * scaleY * 0.18)) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const fitted = { x: xs[Math.floor(xs.length / 2)] / scaleX, y: ys[0] / scaleY, w: 0, h: (ys[ys.length - 1] + 1) / scaleY - ys[0] / scaleY };
  if (fitted.h < Math.max(12, Math.abs(shape.box.h) * 0.35) || fitted.h > Math.abs(shape.box.h) * 1.35) return null;
  return fitted;
}
function fitHorizontalLineToSource(shape, image, slideSize) {
  const stroke = hexColor(shape?.style?.stroke);
  if (!stroke || !shape?.box || !image || !slideSize) return null;
  if (Math.abs(Number(shape.box.w || 0)) < 16 || Math.abs(Number(shape.box.h || 0)) > Math.max(1, Math.abs(Number(shape.box.w || 0)) * 0.08)) return null;
  const probe = { x: Number(shape.box.x), y: Number(shape.box.y) - 2, w: Number(shape.box.w), h: 4 };
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((probe.x - 3) * scaleX));
  const top = Math.max(0, Math.floor((probe.y - 3) * scaleY));
  const right = Math.min(image.width, Math.ceil((probe.x + probe.w + 3) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((probe.y + probe.h + 3) * scaleY));
  const xs = []; const ys = [];
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const color = pixelColor(image, x, y);
    if (lineSourcePixelMatchesStroke(color, stroke)) {
      xs.push(x); ys.push(y);
    }
  }
  if (xs.length < Math.max(20, Math.abs(shape.box.w) * scaleX * 0.18)) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const fitted = { x: xs[0] / scaleX, y: ys[Math.floor(ys.length / 2)] / scaleY, w: (xs[xs.length - 1] + 1) / scaleX - xs[0] / scaleX, h: 0 };
  if (fitted.w < Math.max(12, Math.abs(shape.box.w) * 0.35) || fitted.w > Math.abs(shape.box.w) * 1.35) return null;
  return fitted;
}
function lineSourcePixelMatchesStroke(color, stroke) {
  if (color.a <= 64 || colorDistance(color, stroke) > 36) return false;
  return colorBrightness(color) < 252 || colorDistance(color, { r: 255, g: 255, b: 255, a: 255 }) > 10;
}
function fitDeckSourceVerticalLines(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const detector = String(shape?.source?.detector || "");
      const priorityKey = `${pageIndex}:${shape?.id || ""}`;
      if (shape?.type !== "line"
        || (detector !== "long-axis-line" && detector !== "line-text-native-card-side-accent" && !priorityIds.has(priorityKey))) continue;
      const fit = fitVerticalLineToSource(shape, image, next.slideSize) || fitHorizontalLineToSource(shape, image, next.slideSize);
      if (!fit) continue;
      const movement = Math.abs(fit.x - shape.box.x) + Math.abs(fit.y - shape.box.y) + Math.abs(fit.w - shape.box.w) + Math.abs(fit.h - shape.box.h);
      if (movement < 0.25) continue;
      const priority = priorityIds.has(priorityKey) ? priorityIds.get(priorityKey) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fit, priority, score: movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.box = item.fit;
    shape.source = { ...(shape.source || {}), finalSourceVerticalLineFit: { provider: "worker-final-source-vertical-line-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalSourceVerticalLineFit: { provider: "worker-final-source-vertical-line-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
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
function sampledLowContrastFooterMarkFill(shape, image, slideSize) {
  if (!shape?.box || !image || !slideSize) return null;
  const current = hexColor(shape?.style?.fill);
  if (!current) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w < 4 || px.h < 4 || px.w * px.h > 80_000) return null;
  const colors = [];
  for (let y = px.y; y < px.y + px.h; y += 1) for (let x = px.x; x < px.x + px.w; x += 1) {
    const color = pixelColor(image, x, y);
    if (color.a <= 128) continue;
    const brightnessValue = colorBrightness(color);
    if (brightnessValue >= 245 && saturationProxy(color) <= 18) continue;
    if (brightnessValue < 95 || brightnessValue > 235 || saturationProxy(color) > 55) continue;
    colors.push(color);
  }
  if (colors.length < Math.max(8, px.w * px.h * 0.12)) return null;
  colors.sort((left, right) => colorBrightness(left) - colorBrightness(right));
  const sampled = rgbToHex(colors[Math.floor(colors.length / 2)]);
  if (colorDistance(hexColor(sampled), current) < 5) return null;
  return sampled;
}
function fitDeckLowContrastFooterMarks(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetOpacity = Number.isFinite(options.targetOpacity) ? Math.max(0.25, Math.min(0.9, options.targetOpacity)) : 0.5;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "low-contrast-footer-native-mark" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      const currentOpacity = Number(shape.style.opacity ?? 1);
      if (!fill || !Number.isFinite(currentOpacity)) continue;
      if (colorBrightness(fill) < 120 || colorBrightness(fill) > 220 || saturationProxy(fill) > 42) continue;
      const area = Number(shape.box.w || 0) * Number(shape.box.h || 0);
      if (!Number.isFinite(area) || area < 50 || area > 2500) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      const sampledFill = sampledLowContrastFooterMarkFill(shape, image, next.slideSize);
      if (!sampledFill && currentOpacity <= targetOpacity) continue;
      candidates.push({ pageIndex, index, priority, score: sampledFill ? area + 1000 : area, sampledFill });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = item.sampledFill ? { ...shape.style, fill: item.sampledFill } : { ...shape.style, opacity: targetOpacity };
    shape.source = { ...(shape.source || {}), finalLowContrastFooterMarkFit: { provider: "worker-final-low-contrast-footer-mark-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLowContrastFooterMarkFit: { provider: "worker-final-low-contrast-footer-mark-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length, opacity: targetOpacity } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
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

function nativeShapeThinStrokeMultipliers() {
  return [0.86, 0.75, 0.66, 0.58];
}

function nativeShapeThinStrokeQualityAcceptable({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  if (![beforePixel, afterPixel, beforeMean, afterMean, beforeForeground, afterForeground].every(Number.isFinite)) return false;
  if (afterPixel > beforePixel - 0.0015) return false;
  if (afterMean > beforeMean - 0.04) return false;
  if (afterForeground > beforeForeground + 0.025) return false;
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention + 6) return false;
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity > beforeSeverity + 0.08) return false;
  return true;
}
function editableTextFontFamilyQualityAcceptable({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.24) return false;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  if (![beforePixel, afterPixel, beforeMean, afterMean, beforeForeground, afterForeground].every(Number.isFinite)) return false;
  if (afterPixel > beforePixel - 0.0025) return false;
  if (afterMean > beforeMean - 0.04) return false;
  if (afterForeground > beforeForeground + 0.025) return false;
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention + 8) return false;
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity > beforeSeverity + 0.25) return false;
  return true;
}
function compactDeckNativeShapeSourceProvenance(deck) {
  const next = structuredClone(deck);
  let changedShapes = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const removableFields = ["editable", "nativeRebuild", "semanticNativeStructure"];
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (!shape?.source || typeof shape.source !== "object" || Array.isArray(shape.source)) continue;
      let changed = false;
      for (const field of removableFields) {
        if (!Object.prototype.hasOwnProperty.call(shape.source, field)) continue;
        delete shape.source[field];
        removedFields += 1;
        removedFieldNames.add(field);
        changed = true;
      }
      if (changed) changedShapes += 1;
    }
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalShapeSourceProvenanceCompaction: {
        provider: "worker-final-shape-source-provenance-compaction-v1",
        changedShapes,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedShapes, removedFields, removedFieldNames: [...removedFieldNames].sort() };
}
function compactDeckLateShapeSourceBudgetProvenance(deck) {
  const next = structuredClone(deck);
  let changedShapes = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const removableFields = [
    "nativeComponentArchetype",
    "nativeComponentRole",
    "pageImage",
    "textCount",
    "rowSize",
    "sourceTextId",
    "rowIndex",
    "columnIndex",
    "finalSourceVerticalLineFit",
    "finalSaturatedColorPanelFit",
    "finalLowSaturationPanelFillFit",
    "finalLowContrastFooterMarkFit",
    "finalNativeShapeThinStrokeFit",
    "sourceComponentId",
    "sourceComponentKind"
  ];
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (!shape?.source || typeof shape.source !== "object" || Array.isArray(shape.source)) continue;
      let changed = false;
      for (const field of removableFields) {
        if (!Object.prototype.hasOwnProperty.call(shape.source, field)) continue;
        delete shape.source[field];
        removedFields += 1;
        removedFieldNames.add(field);
        changed = true;
      }
      if (shape.source.componentQualityIgnore === true
        && typeof shape.source.detector === "string"
        && shape.source.detector.endsWith("-native-primitive")) {
        delete shape.source.detector;
        removedFields += 1;
        removedFieldNames.add("detector");
        changed = true;
      }
      if (changed) changedShapes += 1;
    }
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalLateShapeSourceBudgetCompaction: {
        provider: "worker-final-late-shape-source-budget-compaction-v1",
        changedShapes,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedShapes, removedFields, removedFieldNames: [...removedFieldNames].sort() };
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
function compactDeckFinalQualitySourceProvenance(deck) {
  const next = structuredClone(deck);
  let changedElements = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const keepFields = new Set([
    // Classification and lineage are audit evidence, not disposable debug data.
    "detector", "fullSlideResidual", "residualCrop", "tiledLargeRaster",
    "visualFallbackSource", "strategy", "lineageId", "parentRasterId",
    "parentLargeRasterId", "sourceAssetSha256",
    "componentQualityBox",
    "componentQualityIgnore",
    "componentQualityRole",
    "componentRenderStrategy",
    "coordinateReferenceSizePx",
    "crop",
    "cropEvidenceRequired",
    "cropRect",
    "layer",
    "mappedPixelBox",
    "nativeComponentGroupId",
    "ocrProvider",
    "originalPixelBox",
    "pageImage",
    "protectedMinimumUnit",
    "removedNeighborPixels",
    "retainedDetailComponents",
    "tableOverlay",
    "tightenedPixelBox",
  ]);
  function compactElementSource(element) {
    if (!element?.source || typeof element.source !== "object" || Array.isArray(element.source)) return;
    let changed = false;
    for (const field of Object.keys(element.source)) {
      if (field === "nativeRebuild" && typeof element.source[field] === "boolean") continue;
      if (keepFields.has(field)) continue;
      delete element.source[field];
      removedFields += 1;
      removedFieldNames.add(field);
      changed = true;
    }
    if (Object.keys(element.source).length < 1) {
      delete element.source;
      changed = true;
    }
    if (changed) changedElements += 1;
  }
  function removeField(record, field, owner) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !Object.prototype.hasOwnProperty.call(record, field)) return false;
    delete record[field];
    removedFields += 1;
    removedFieldNames.add(`${owner}.${field}`);
    return true;
  }
  function compactTextBoxDefaults(textBox) {
    let changed = false;
    if (textBox?.style && typeof textBox.style === "object" && !Array.isArray(textBox.style)) {
      if (textBox.style.visibility === "visible") changed = removeField(textBox.style, "visibility", "textStyle") || changed;
      if (textBox.style.opacity === 1) changed = removeField(textBox.style, "opacity", "textStyle") || changed;
      if (textBox.style.marginLeftPt === 0) changed = removeField(textBox.style, "marginLeftPt", "textStyle") || changed;
      if (textBox.style.marginRightPt === 0) changed = removeField(textBox.style, "marginRightPt", "textStyle") || changed;
      if (textBox.style.marginTopPt === 0) changed = removeField(textBox.style, "marginTopPt", "textStyle") || changed;
      if (textBox.style.marginBottomPt === 0) changed = removeField(textBox.style, "marginBottomPt", "textStyle") || changed;
      if (textBox.style.fit === "shrink") changed = removeField(textBox.style, "fit", "textStyle") || changed;
      if (Object.keys(textBox.style).length < 1) changed = removeField(textBox, "style", "textBox") || changed;
    }
    if (textBox?.font && typeof textBox.font === "object" && !Array.isArray(textBox.font)) {
      if (textBox.font.opacity === 1) changed = removeField(textBox.font, "opacity", "textFont") || changed;
      if (String(textBox.font.weight || "").toLowerCase() === "regular") changed = removeField(textBox.font, "weight", "textFont") || changed;
      if (String(textBox.font.align || "").toLowerCase() === "left") changed = removeField(textBox.font, "align", "textFont") || changed;
    }
    if (changed) changedElements += 1;
  }
  function compactShapeDefaults(shape) {
    if (!shape?.style || typeof shape.style !== "object" || Array.isArray(shape.style)) return;
    let changed = false;
    if (shape.style.opacity === 1) changed = removeField(shape.style, "opacity", "shapeStyle") || changed;
    if (Number(shape.style.strokeWidthPt) === 0) {
      changed = removeField(shape.style, "strokeWidthPt", "shapeStyle") || changed;
      if (typeof shape.style.stroke === "string") changed = removeField(shape.style, "stroke", "shapeStyle") || changed;
    }
    if (changed) changedElements += 1;
  }
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const key of ["shapes", "textBoxes", "images", "tables", "charts", "icons"]) {
      for (const element of Array.isArray(page?.[key]) ? page[key] : []) compactElementSource(element);
    }
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) compactShapeDefaults(shape);
    for (const textBox of Array.isArray(page?.textBoxes) ? page.textBoxes : []) compactTextBoxDefaults(textBox);
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalQualitySourceProvenanceCompaction: {
        provider: "worker-final-quality-source-provenance-compaction-v1",
        changedElements,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedElements, removedFields, removedFieldNames: [...removedFieldNames].sort() };
}
function compactDeckFinalPrimitiveCandidate(deck) {
  const nativeCompacted = compactDeckNativeShapeSourceProvenance(deck).deck;
  const shapeCompacted = compactDeckLateShapeSourceBudgetProvenance(nativeCompacted).deck;
  const textCompacted = compactDeckLateTextSourceBudgetProvenance(shapeCompacted).deck;
  return compactDeckPrimitiveCandidateDiagnosticMeta(compactDeckFinalQualitySourceProvenance(textCompacted).deck);
}

function compactDeckPrimitiveCandidateDiagnosticMeta(deck) {
  const next = structuredClone(deck);
  if (!next.meta || typeof next.meta !== "object" || Array.isArray(next.meta)) return next;
  compactUnsafeDiagnosticNumbers(next.meta);
  return next;
}

function compactUnsafeDiagnosticNumbers(value) {
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    const child = value[key];
    if (typeof child === "number") {
      if (!Number.isFinite(child) || Math.abs(child) > 100000) delete value[key];
      continue;
    }
    if (child && typeof child === "object") compactUnsafeDiagnosticNumbers(child);
  }
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
function fitDeckLightCardStrokes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetStrokeWidthPt = Number.isFinite(options.targetStrokeWidthPt) ? Math.max(0.55, Math.min(1.1, options.targetStrokeWidthPt)) : 0.8;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "line-text-native-card-row" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      const stroke = hexColor(shape.style.stroke);
      const currentWidth = Number(shape.style.strokeWidthPt);
      if (!fill || !stroke || !Number.isFinite(currentWidth) || currentWidth >= targetStrokeWidthPt) continue;
      if (colorBrightness(fill) < 238 || colorBrightness(stroke) < 210 || colorDistance(fill, stroke) > 42) continue;
      const area = Number(shape.box.w || 0) * Number(shape.box.h || 0);
      if (!Number.isFinite(area) || area < 900) continue;
      const score = area / Math.max(1, colorDistance(fill, stroke));
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, priority, score });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, strokeWidthPt: targetStrokeWidthPt };
  }
  if (selected.length > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalLightCardStrokeFit: {
        provider: "worker-final-light-card-stroke-fit-v1",
        changedShapes: selected.length,
        candidateShapes: candidates.length,
        strokeWidthPt: targetStrokeWidthPt
      }
    };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
function sampledContainerStrokeColor(shape, image, slideSize) {
  if (!shape?.box || !shape?.style || !image || !slideSize) return null;
  const fill = hexColor(shape.style.fill);
  const stroke = hexColor(shape.style.stroke) || fill;
  if (!fill || !stroke) return null;
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w < 12 || px.h < 12 || px.w * px.h > 1_500_000) return null;
  const band = Math.max(2, Math.min(6, Math.round(Math.min(px.w, px.h) * 0.08)));
  const colors = [];
  for (let y = px.y; y < px.y + px.h; y += 1) for (let x = px.x; x < px.x + px.w; x += 1) {
    const edge = x - px.x < band || px.x + px.w - 1 - x < band || y - px.y < band || px.y + px.h - 1 - y < band;
    if (!edge) continue;
    const color = pixelColor(image, x, y);
    const brightnessValue = colorBrightness(color);
    const saturationValue = saturationProxy(color);
    if (color.a < 160 || brightnessValue > 252 || colorDistance(color, fill) < 12) continue;
    if (brightnessValue < 52 || saturationValue < 6) continue;
    colors.push(color);
  }
  if (colors.length < Math.max(12, (px.w + px.h) * 0.08)) return null;
  const dominant = dominantColor(colors);
  if (!dominant) return null;
  if (colorDistance(dominant, stroke) < 8) return null;
  if (colorDistance(dominant, fill) < 12) return null;
  return rgbToHex(dominant);
}
function lightCardBoundaryPixel(color, fill) {
  if (color.a < 128) return false;
  const brightnessValue = colorBrightness(color);
  if (brightnessValue > 252) return false;
  if (colorDistance(color, fill) < 8) return false;
  return brightnessValue <= 246 || saturationProxy(color) >= 4;
}
function strongProjectionBands(values, threshold) {
  const bands = [];
  let start = null;
  let total = 0;
  let peak = 0;
  for (let index = 0; index <= values.length; index += 1) {
    const value = index < values.length ? values[index] : 0;
    if (value >= threshold) {
      if (start === null) start = index;
      total += value;
      peak = Math.max(peak, value);
    } else if (start !== null) {
      bands.push({ start, end: index, center: (start + index) / 2, total, peak });
      start = null;
      total = 0;
      peak = 0;
    }
  }
  return bands;
}
function selectCardProjectionBand(bands, target, minCenter, maxCenter) {
  return bands
    .filter((band) => band.center >= minCenter && band.center <= maxCenter)
    .map((band) => ({ band, score: band.total + band.peak * 8 - Math.abs(band.center - target) * 3 }))
    .sort((a, b) => b.score - a.score)[0]?.band || null;
}
function sourceLightCardProjectionGeometry(shape, image, slideSize, fill, base, scan) {
  const columnCounts = new Array(scan.w).fill(0);
  const rowCounts = new Array(scan.h).fill(0);
  const columnRuns = new Array(scan.w).fill(0);
  const rowRuns = new Array(scan.h).fill(0);
  for (let y = scan.y; y < scan.y + scan.h; y += 1) {
    for (let x = scan.x; x < scan.x + scan.w; x += 1) {
      if (!lightCardBoundaryPixel(pixelColor(image, x, y), fill)) continue;
      columnCounts[x - scan.x] += 1;
      rowCounts[y - scan.y] += 1;
    }
  }
  for (let x = scan.x; x < scan.x + scan.w; x += 1) {
    let run = 0;
    for (let y = scan.y; y < scan.y + scan.h; y += 1) {
      if (lightCardBoundaryPixel(pixelColor(image, x, y), fill)) {
        run += 1;
        columnRuns[x - scan.x] = Math.max(columnRuns[x - scan.x], run);
      } else {
        run = 0;
      }
    }
  }
  for (let y = scan.y; y < scan.y + scan.h; y += 1) {
    let run = 0;
    for (let x = scan.x; x < scan.x + scan.w; x += 1) {
      if (lightCardBoundaryPixel(pixelColor(image, x, y), fill)) {
        run += 1;
        rowRuns[y - scan.y] = Math.max(rowRuns[y - scan.y], run);
      } else {
        run = 0;
      }
    }
  }
  const verticalThreshold = Math.max(7, Math.round(base.h * 0.42));
  const horizontalThreshold = Math.max(8, Math.round(base.w * 0.35));
  const verticalCountThreshold = Math.max(7, Math.round(base.h * 0.18));
  const horizontalCountThreshold = Math.max(8, Math.round(base.w * 0.18));
  const verticalBands = [...strongProjectionBands(columnRuns, verticalThreshold), ...strongProjectionBands(columnCounts, verticalCountThreshold)]
    .filter((band) => band.end - band.start <= Math.max(16, Math.round(base.w * 0.18)));
  const horizontalBands = [...strongProjectionBands(rowRuns, horizontalThreshold), ...strongProjectionBands(rowCounts, horizontalCountThreshold)]
    .filter((band) => band.end - band.start <= Math.max(12, Math.round(base.h * 0.18)));
  if (verticalBands.length < 1 || horizontalBands.length < 1) return null;
  const baseLeft = base.x - scan.x;
  const baseRight = base.x + base.w - scan.x;
  const baseTop = base.y - scan.y;
  const baseBottom = base.y + base.h - scan.y;
  const left = selectCardProjectionBand(verticalBands, baseLeft, 0, baseLeft + base.w * 0.48);
  const right = selectCardProjectionBand(verticalBands, baseRight, baseRight - base.w * 0.48, scan.w);
  const top = selectCardProjectionBand(horizontalBands, baseTop, 0, baseTop + base.h * 0.5);
  const bottom = selectCardProjectionBand(horizontalBands, baseBottom, baseBottom - base.h * 0.5, scan.h);
  const x1 = left ? scan.x + left.start : base.x;
  const x2 = right ? scan.x + right.end : base.x + base.w;
  const y1 = top ? scan.y + top.start : base.y;
  const y2 = bottom ? scan.y + bottom.end : base.y + base.h;
  const fittedEdges = Number(Boolean(left)) + Number(Boolean(right)) + Number(Boolean(top)) + Number(Boolean(bottom));
  if (fittedEdges < 2 || (Number(Boolean(left)) + Number(Boolean(right)) < 1) || (Number(Boolean(top)) + Number(Boolean(bottom)) < 1)) return null;
  if (x2 <= x1 || y2 <= y1) return null;
  const fitted = pxToPtBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, image, slideSize);
  const movement = Math.abs(fitted.x - shape.box.x) + Math.abs(fitted.y - shape.box.y) + Math.abs(fitted.w - shape.box.w) * 0.5 + Math.abs(fitted.h - shape.box.h) * 0.5;
  return { box: fitted, movement, fittedEdges, provider: "projection" };
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
function sourceLightCardGeometry(shape, image, slideSize, textBoxes = [], options = {}) {
  if (!shape?.box || !shape?.style || !image || !slideSize) return null;
  const fill = hexColor(shape.style.fill);
  if (!fill || colorBrightness(fill) < 238) return null;
  const base = ptToPxBox(shape.box, image, slideSize);
  if (!base || base.w < 18 || base.h < 18) return null;
  const projectionPad = Math.max(8, Math.round(Math.min(base.w, base.h) * 0.42));
  const projectionScan = {
    x: Math.max(0, base.x - projectionPad),
    y: Math.max(0, base.y - projectionPad),
    w: Math.min(image.width, base.x + base.w + projectionPad) - Math.max(0, base.x - projectionPad),
    h: Math.min(image.height, base.y + base.h + projectionPad) - Math.max(0, base.y - projectionPad)
  };
  if (projectionScan.w * projectionScan.h > 500_000) return null;
  const projection = sourceLightCardProjectionGeometry(shape, image, slideSize, fill, base, projectionScan);
  const pad = Math.max(5, Math.round(Math.min(base.w, base.h) * 0.22));
  const scan = {
    x: Math.max(0, base.x - pad),
    y: Math.max(0, base.y - pad),
    w: Math.min(image.width, base.x + base.w + pad) - Math.max(0, base.x - pad),
    h: Math.min(image.height, base.y + base.h + pad) - Math.max(0, base.y - pad)
  };
  if (scan.w * scan.h > 500_000) return null;
  const seen = new Uint8Array(scan.w * scan.h);
  function localIndex(x, y) { return (y - scan.y) * scan.w + (x - scan.x); }
  function isEdgePixel(x, y) {
    const color = pixelColor(image, x, y);
    if (!lightCardBoundaryPixel(color, fill)) return false;
    return saturationProxy(color) >= 8 || colorBrightness(color) <= 235;
  }
  const components = [];
  for (let y = scan.y; y < scan.y + scan.h; y += 1) {
    for (let x = scan.x; x < scan.x + scan.w; x += 1) {
      const start = localIndex(x, y);
      if (seen[start] || !isEdgePixel(x, y)) continue;
      const queue = [[x, y]];
      seen[start] = 1;
      let x1 = x, y1 = y, x2 = x + 1, y2 = y + 1, count = 0;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const [cx, cy] = queue[cursor];
        count += 1; x1 = Math.min(x1, cx); y1 = Math.min(y1, cy); x2 = Math.max(x2, cx + 1); y2 = Math.max(y2, cy + 1);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < scan.x || nx >= scan.x + scan.w || ny < scan.y || ny >= scan.y + scan.h) continue;
          const index = localIndex(nx, ny);
          if (seen[index] || !isEdgePixel(nx, ny)) continue;
          seen[index] = 1;
          queue.push([nx, ny]);
        }
      }
      const width = x2 - x1;
      const height = y2 - y1;
      if (count < 18 || width < base.w * 0.35 || height < base.h * 0.25) continue;
      components.push({ x: x1, y: y1, w: width, h: height, count });
    }
  }
  const baseCenterX = base.x + base.w / 2;
  const baseCenterY = base.y + base.h / 2;
  const best = components
    .map((box) => {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const centerPenalty = Math.abs(cx - baseCenterX) / Math.max(1, base.w) + Math.abs(cy - baseCenterY) / Math.max(1, base.h);
      const sizePenalty = Math.abs(box.w - base.w) / Math.max(1, base.w) + Math.abs(box.h - base.h) / Math.max(1, base.h);
      return { box, score: box.count - (centerPenalty + sizePenalty) * 80 };
    })
    .sort((a, b) => b.score - a.score)[0]?.box;
  let connected = null;
  if (best) {
    const fitted = pxToPtBox(best, image, slideSize);
    const movement = Math.abs(fitted.x - shape.box.x) + Math.abs(fitted.y - shape.box.y) + Math.abs(fitted.w - shape.box.w) * 0.5 + Math.abs(fitted.h - shape.box.h) * 0.5;
    connected = { box: fitted, movement, provider: "component" };
  }
  const allowTextAnchorGeometry = options.allowTextAnchorGeometry !== false;
  const textAnchor = allowTextAnchorGeometry ? sourceLightCardTextAnchorGeometry(shape, textBoxes, slideSize) : null;
  const candidates = [projection, connected, textAnchor].filter(Boolean).filter((item) =>
    item.box.w >= shape.box.w * 0.55
    && item.box.w <= shape.box.w * 1.35
    && item.box.h >= shape.box.h * 0.45
    && item.box.h <= shape.box.h * 1.35
    && item.movement >= 0.4
    && item.movement <= Math.max(30, Math.max(shape.box.w, shape.box.h) * 0.45));
  return candidates.sort((a, b) =>
    (b.fittedEdges || 0) - (a.fittedEdges || 0)
    || (a.provider === "text-anchor" ? -0.5 : 0) - (b.provider === "text-anchor" ? -0.5 : 0)
    || Math.abs(a.movement - shape.box.h * 0.12) - Math.abs(b.movement - shape.box.h * 0.12))[0] || null;
}
function adjustCardSideAccentForGeometry(accent, oldBox, newBox) {
  if (!accent?.box || !oldBox || !newBox) return;
  const side = String(accent?.source?.side || accent?.source?.supportedSide || "");
  const box = accent.box;
  const xRatio = oldBox.w > 0 ? newBox.w / oldBox.w : 1;
  const yRatio = oldBox.h > 0 ? newBox.h / oldBox.h : 1;
  if (side === "left" || side === "right") {
    box.x = side === "left" ? newBox.x : newBox.x + newBox.w;
    box.y = newBox.y + (Number(box.y || 0) - oldBox.y) * yRatio;
    box.h = Math.max(0, Number(box.h || 0) * yRatio);
    return;
  }
  if (side === "top" || side === "bottom") {
    box.x = newBox.x + (Number(box.x || 0) - oldBox.x) * xRatio;
    box.y = side === "top" ? newBox.y : newBox.y + newBox.h;
    box.w = Math.max(0, Number(box.w || 0) * xRatio);
  }
}
function cardSideAttachmentMatchesGeometry(accent, oldBox) {
  if (!accent?.box || !oldBox) return false;
  const side = String(accent?.source?.side || accent?.source?.supportedSide || "");
  const box = accent.box;
  const tolerance = Math.max(1.5, Math.min(9, Math.max(Number(oldBox.w || 0), Number(oldBox.h || 0)) * 0.075));
  const x1 = Number(box.x || 0);
  const x2 = x1 + Math.max(0, Number(box.w || 0));
  const y1 = Number(box.y || 0);
  const y2 = y1 + Math.max(0, Number(box.h || 0));
  if (side === "left" || side === "right") {
    const edgeX = side === "left" ? Number(oldBox.x || 0) : Number(oldBox.x || 0) + Number(oldBox.w || 0);
    const overlap = Math.min(y2, Number(oldBox.y || 0) + Number(oldBox.h || 0)) - Math.max(y1, Number(oldBox.y || 0));
    return Math.abs(x1 - edgeX) <= tolerance && overlap >= Math.max(1, Math.min(Number(oldBox.h || 0), Math.max(0, y2 - y1)) * 0.45);
  }
  if (side === "top" || side === "bottom") {
    const edgeY = side === "top" ? Number(oldBox.y || 0) : Number(oldBox.y || 0) + Number(oldBox.h || 0);
    const overlap = Math.min(x2, Number(oldBox.x || 0) + Number(oldBox.w || 0)) - Math.max(x1, Number(oldBox.x || 0));
    return Math.abs(y1 - edgeY) <= tolerance && overlap >= Math.max(1, Math.min(Number(oldBox.w || 0), Math.max(0, x2 - x1)) * 0.45);
  }
  return false;
}
function isCardSideGeometryAttachment(accent, cardId) {
  const source = accent?.source;
  if (!source || typeof source !== "object") return false;
  const detector = String(source.detector || "");
  if (detector === "line-text-native-card-side-accent" && String(source.sourceCardId || "") === cardId) return true;
  return detector === "source-native-edge-refinement" && String(source.sourceShapeId || "") === cardId;
}
function reassignSourceNativeEdgeLineOwners(shapes) {
  if (!Array.isArray(shapes)) return 0;
  const cards = shapes.filter((shape) => shape?.source?.detector === "line-text-native-card-row" && shape.box && shape.id);
  if (cards.length < 2) return 0;
  let reassigned = 0;
  for (const line of shapes) {
    const source = line?.source;
    if (!source || typeof source !== "object" || source.detector !== "source-native-edge-refinement" || !line.box) continue;
    const currentId = String(source.sourceShapeId || "");
    let best = null;
    for (const card of cards) {
      if (!cardSideAttachmentMatchesGeometry(line, card.box)) continue;
      const side = String(source.supportedSide || "");
      const lineBox = line.box;
      const cardBox = card.box;
      const axisDistance = side === "left" || side === "right"
        ? Math.abs(Number(lineBox.x || 0) - (side === "left" ? Number(cardBox.x || 0) : Number(cardBox.x || 0) + Number(cardBox.w || 0)))
        : Math.abs(Number(lineBox.y || 0) - (side === "top" ? Number(cardBox.y || 0) : Number(cardBox.y || 0) + Number(cardBox.h || 0)));
      const overlap = side === "left" || side === "right"
        ? Math.min(Number(lineBox.y || 0) + Number(lineBox.h || 0), Number(cardBox.y || 0) + Number(cardBox.h || 0)) - Math.max(Number(lineBox.y || 0), Number(cardBox.y || 0))
        : Math.min(Number(lineBox.x || 0) + Number(lineBox.w || 0), Number(cardBox.x || 0) + Number(cardBox.w || 0)) - Math.max(Number(lineBox.x || 0), Number(cardBox.x || 0));
      const score = overlap - axisDistance * 2;
      if (!best || score > best.score) best = { card, score };
    }
    if (best?.card?.id && String(best.card.id) !== currentId) {
      line.source = {
        ...source,
        sourceShapeId: String(best.card.id),
        sourceNativeEdgeOwnerReassigned: {
          provider: "worker-source-native-edge-owner-reassign-v1",
          previousSourceShapeId: currentId
        }
      };
      reassigned += 1;
    }
  }
  return reassigned;
}
function fitDeckLightCardGeometry(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  let reassignedSourceEdgeLines = 0;
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    reassignedSourceEdgeLines += reassignSourceNativeEdgeLineOwners(shapes);
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (!shape?.box || !shape.style) continue;
      const fit = shape?.source?.detector === "line-text-native-card-row"
        ? sourceLightCardGeometry(shape, image, next.slideSize, next.pages[pageIndex]?.textBoxes || [], { allowTextAnchorGeometry: options.allowTextAnchorGeometry })
        : fitSourceLightPanelGeometry(shape, image, next.slideSize);
      if (!fit) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, fit, priority, score: fit.movement });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  const changedComponentKeys = [];
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    const oldBox = { ...shape.box };
    if (typeof shape.id === "string" && shape.id) changedComponentKeys.push(`${item.pageIndex}:${shape.id}`);
    shape.box = item.fit.box;
    shape.source = {
      ...(shape.source || {}),
      ...(item.fit.provider === "source-light-panel-transition" ? { finalLightPanelSourceGeometryFit: { provider: "worker-source-light-panel-transition-v1", fittedEdges: 4 } } : {}),
      ...(item.fit.provider === "text-anchor" ? { finalLightCardTextAnchorGeometryFit: { provider: "worker-final-light-card-text-anchor-geometry-fit-v1" } } : {})
    };
    for (const accent of next.pages[item.pageIndex].shapes) {
      if (!isCardSideGeometryAttachment(accent, String(shape.id || ""))) continue;
      if (!cardSideAttachmentMatchesGeometry(accent, oldBox)) continue;
      adjustCardSideAccentForGeometry(accent, oldBox, item.fit.box);
    }
  }
  let removedBackgrounds = 0, reorderedSourceIconShapes = 0;
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex++) {
    const page = next.pages[pageIndex];
    const otherObjects = [page.textBoxes, page.images, page.icons, page.tables, page.charts].flatMap(items => Array.isArray(items) ? items : []);
    const plans = planRedundantPanelBackgrounds(page.shapes, next.slideSize, otherObjects);
    const ids = new Set(plans.map(plan => plan.removedId));
    page.shapes = page.shapes.filter(shape => !ids.has(shape.id));
    removedBackgrounds += plans.length;
    for (const plan of plans) if (!changedComponentKeys.includes(`${pageIndex}:${plan.ownerId}`)) changedComponentKeys.push(`${pageIndex}:${plan.ownerId}`);
    const ordered = orderSourceIconLayers(page.shapes, next.slideSize);
    page.shapes = ordered.shapes;
    reorderedSourceIconShapes += ordered.movedShapes;
  }
  const changedShapes = selected.length + removedBackgrounds + reorderedSourceIconShapes;
  if (changedShapes > 0 || reassignedSourceEdgeLines > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardGeometryFit: { provider: "worker-final-light-card-geometry-fit-v1", changedShapes, candidateShapes: candidates.length, removedBackgrounds, reorderedSourceIconShapes, reassignedSourceEdgeLines, changedComponentKeys } };
  }
  return { deck: next, changedShapes, candidateShapes: candidates.length, removedBackgrounds, reassignedSourceEdgeLines, changedComponentKeys };
}
function fitDeckLightCardStrokeColors(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "line-text-native-card-row" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      if (!fill || colorBrightness(fill) < 238) continue;
      const stroke = hexColor(shape.style.stroke);
      const sampled = sampledContainerStrokeColor(shape, image, next.slideSize);
      if (!stroke || !sampled) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, stroke: sampled, priority, score: colorDistance(hexColor(sampled), stroke) });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, stroke: item.stroke };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardStrokeColorFit: { provider: "worker-final-light-card-stroke-color-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
function fitDeckLightCardSourceStrokes(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const targetStrokeWidthPt = Number.isFinite(options.targetStrokeWidthPt) ? Math.max(0.55, Math.min(1.1, options.targetStrokeWidthPt)) : 0.68;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const shapes = Array.isArray(next.pages[pageIndex]?.shapes) ? next.pages[pageIndex].shapes : [];
    const image = pageImages[pageIndex];
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (shape?.source?.detector !== "line-text-native-card-row" || !shape.box || !shape.style) continue;
      const fill = hexColor(shape.style.fill);
      if (!fill || colorBrightness(fill) < 238) continue;
      if (shape.source?.finalLightCardSourceStrokeFit?.provider === "worker-final-light-card-source-stroke-fit-v1") continue;
      const currentWidth = Number(shape.style.strokeWidthPt);
      if (Number.isFinite(currentWidth) && currentWidth >= targetStrokeWidthPt) continue;
      const sampled = sampledContainerStrokeColor(shape, image, next.slideSize);
      if (!sampled) continue;
      const area = Number(shape.box.w || 0) * Number(shape.box.h || 0);
      if (!Number.isFinite(area) || area < 900) continue;
      const priority = priorityIds.has(`${pageIndex}:${shape.id}`) ? priorityIds.get(`${pageIndex}:${shape.id}`) : Number.MAX_SAFE_INTEGER;
      candidates.push({ pageIndex, index, stroke: sampled, priority, score: area });
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index).slice(0, candidateLimit));
  for (const item of selected) {
    const shape = next.pages[item.pageIndex].shapes[item.index];
    shape.style = { ...shape.style, stroke: item.stroke, strokeWidthPt: targetStrokeWidthPt };
    shape.source = { ...(shape.source || {}), finalLightCardSourceStrokeFit: { provider: "worker-final-light-card-source-stroke-fit-v1" } };
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardSourceStrokeFit: { provider: "worker-final-light-card-source-stroke-fit-v1", changedShapes: selected.length, candidateShapes: candidates.length, strokeWidthPt: targetStrokeWidthPt } };
  }
  return { deck: next, changedShapes: selected.length, candidateShapes: candidates.length };
}
function sourceLightCardSideAccents(shape, image, slideSize) {
  if (shape?.source?.detector !== "line-text-native-card-row" || !shape?.box || !shape?.style || !image || !slideSize) return [];
  const fill = hexColor(shape.style.fill);
  if (!fill || colorBrightness(fill) < 238) return [];
  const px = ptToPxBox(shape.box, image, slideSize);
  if (!px || px.w < 16 || px.h < 16 || px.w * px.h > 1_500_000) return [];
  const band = Math.max(3, Math.min(10, Math.round(Math.min(px.w, px.h) * 0.1)));
  const sides = [
    { name: "left", x1: px.x, y1: px.y, x2: Math.min(image.width, px.x + band), y2: px.y + px.h, vertical: true },
    { name: "right", x1: Math.max(0, px.x + px.w - band), y1: px.y, x2: px.x + px.w, y2: px.y + px.h, vertical: true },
    { name: "top", x1: px.x, y1: px.y, x2: px.x + px.w, y2: Math.min(image.height, px.y + band), vertical: false },
    { name: "bottom", x1: px.x, y1: Math.max(0, px.y + px.h - band), x2: px.x + px.w, y2: px.y + px.h, vertical: false },
  ];
  const accents = [];
  for (const side of sides) {
    const colors = [];
    const parallel = [];
    const perpendicular = [];
    const covered = new Set();
    for (let y = Math.max(0, side.y1); y < Math.min(image.height, side.y2); y += 1) {
      for (let x = Math.max(0, side.x1); x < Math.min(image.width, side.x2); x += 1) {
        const color = pixelColor(image, x, y);
        const brightnessValue = colorBrightness(color);
        const saturationValue = saturationProxy(color);
        if (color.a < 128 || brightnessValue < 35 || brightnessValue > 250) continue;
        if (colorDistance(color, fill) < 18 || saturationValue < 8) continue;
        colors.push(color);
        parallel.push(side.vertical ? y : x);
        perpendicular.push(side.vertical ? x : y);
        covered.add(side.vertical ? y : x);
      }
    }
    const lengthPx = side.vertical ? px.h : px.w;
    if (colors.length < Math.max(18, lengthPx * 0.22) || covered.size < Math.max(8, lengthPx * 0.32)) continue;
    parallel.sort((a, b) => a - b);
    perpendicular.sort((a, b) => a - b);
    const p1 = parallel[0];
    const p2 = parallel[parallel.length - 1] + 1;
    const q1 = perpendicular[0];
    const q2 = perpendicular[perpendicular.length - 1] + 1;
    const thicknessPx = q2 - q1;
    if (thicknessPx > Math.max(8, band * 1.35) || p2 - p1 < lengthPx * 0.3) continue;
    const dominant = dominantColor(colors);
    if (!dominant) continue;
    const scale = side.vertical ? image.width / slideSize.widthPt : image.height / slideSize.heightPt;
    const strokeWidthPt = Math.max(0.35, Math.min(2.4, thicknessPx / Math.max(0.1, scale)));
    const color = rgbToHex(dominant);
    const score = covered.size + colors.length * 0.1 + colorDistance(dominant, fill) * 0.5;
    if (side.vertical) {
      const x = (q1 + q2) / 2 * slideSize.widthPt / image.width;
      accents.push({
        side: side.name,
        color,
        strokeWidthPt,
        score,
        box: { x, y: p1 * slideSize.heightPt / image.height, w: 0, h: (p2 - p1) * slideSize.heightPt / image.height }
      });
    } else {
      const y = (q1 + q2) / 2 * slideSize.heightPt / image.height;
      accents.push({
        side: side.name,
        color,
        strokeWidthPt,
        score,
        box: { x: p1 * slideSize.widthPt / image.width, y, w: (p2 - p1) * slideSize.widthPt / image.width, h: 0 }
      });
    }
  }
  return accents;
}
function fitDeckLightCardSideAccents(deck, options = {}) {
  const next = structuredClone(deck);
  const candidateLimit = Number.isSafeInteger(options.candidateLimit) && options.candidateLimit > 0 ? options.candidateLimit : null;
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  const pageImages = Array.isArray(options.pageImages) ? options.pageImages : [];
  const candidates = [];
  for (let pageIndex = 0; pageIndex < (Array.isArray(next?.pages) ? next.pages : []).length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    const shapes = Array.isArray(page?.shapes) ? page.shapes : [];
    const image = pageImages[pageIndex];
    const existingIds = new Set(shapes.map((shape) => String(shape?.id || "")));
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      const accents = sourceLightCardSideAccents(shape, image, next.slideSize);
      if (accents.length < 1) continue;
      const priorityKey = `${pageIndex}:${shape.id}`;
      if (priorityIds.size > 0 && !priorityIds.has(priorityKey)) continue;
      const priority = priorityIds.has(priorityKey) ? priorityIds.get(priorityKey) : Number.MAX_SAFE_INTEGER;
      for (const accent of accents) {
        const id = `${shape.id || `card-${index}`}-source-side-accent-${accent.side}`;
        if (existingIds.has(id)) continue;
        candidates.push({ pageIndex, index, id, accent, priority, score: accent.score });
      }
    }
  }
  const selected = (candidateLimit === null ? candidates : [...candidates].sort((a, b) =>
    a.priority - b.priority || b.score - a.score || a.pageIndex - b.pageIndex || a.index - b.index || a.accent.side.localeCompare(b.accent.side)).slice(0, candidateLimit));
  for (const item of selected) {
    const page = next.pages[item.pageIndex];
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    page.shapes.push({
      id: item.id,
      type: "line",
      box: item.accent.box,
      style: {
        stroke: item.accent.color,
        strokeWidthPt: item.accent.strokeWidthPt,
        connectorType: "straight",
        lineCap: "round"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "line-text-native-card-side-accent",
        sourceCardId: String(page.shapes[item.index]?.id || ""),
        side: item.accent.side
      }
    });
  }
  if (selected.length > 0) {
    next.meta = { ...(next.meta || {}), finalLightCardSideAccentFit: { provider: "worker-final-light-card-side-accent-fit-v1", addedShapes: selected.length, candidateShapes: candidates.length } };
  }
  return { deck: next, addedShapes: selected.length, candidateShapes: candidates.length };
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
function sourceComponentFidelityForeground(source, rendered, x, y) {
  const offset = (y * source.width + x) * 4;
  const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2], a: source.rgba[offset + 3] };
  if (color.a < 128) return false;
  const brightnessValue = colorBrightness(color);
  const saturationValue = saturationProxy(color);
  if (brightnessValue >= 253) return false;
  if (brightnessValue < 245 && (brightnessValue < 210 || saturationValue > 18)) return true;
  return sourceRenderedDelta(source, rendered, x, y) > 5
    && (brightnessValue < 250 || saturationValue > 4);
}
function sourceRenderedDelta(source, rendered, x, y) {
  const sourceOffset = (y * source.width + x) * 4;
  const renderedX = Math.min(rendered.width - 1, Math.round(x * rendered.width / source.width));
  const renderedY = Math.min(rendered.height - 1, Math.round(y * rendered.height / source.height));
  const renderedOffset = (renderedY * rendered.width + renderedX) * 4;
  return (Math.abs(source.rgba[sourceOffset] - rendered.rgba[renderedOffset])
    + Math.abs(source.rgba[sourceOffset + 1] - rendered.rgba[renderedOffset + 1])
    + Math.abs(source.rgba[sourceOffset + 2] - rendered.rgba[renderedOffset + 2])
    + Math.abs(source.rgba[sourceOffset + 3] - rendered.rgba[renderedOffset + 3])) / 4;
}
function sourcePixelHex(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return rgbToHex({ r: image.rgba[offset], g: image.rgba[offset + 1], b: image.rgba[offset + 2] });
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
function componentFidelityTargetBox(component) {
  if (!component || !component.box) return null;
  const qualityBox = componentQualityReferenceBox(component);
  if (qualityBox) return qualityBox;
  if (component.source?.evidenceBox && isFiniteBox(component.source.evidenceBox)) return component.source.evidenceBox;
  if (component.type === "line" && isFiniteLineBox(component.box)) return componentLineFidelityTargetBox(component);
  return isFiniteBox(component.box) ? component.box : null;
}
function componentQualityReferenceBox(component) {
  const qualityBox = component?.source?.componentQualityBox;
  return isFiniteBox(qualityBox) && Number(qualityBox.w) > 0 && Number(qualityBox.h) > 0 ? qualityBox : null;
}
function isFiniteLineBox(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])))
    && (Math.abs(Number(value.w)) > 0 || Math.abs(Number(value.h)) > 0);
}
function componentLineFidelityTargetBox(component) {
  const box = component.box;
  const strokeWidthPt = Number(component?.style?.strokeWidthPt);
  const perpendicularPad = Math.max(2.5, Math.min(10, (Number.isFinite(strokeWidthPt) && strokeWidthPt > 0 ? strokeWidthPt : 1) * 4));
  const endPad = Math.max(1.5, perpendicularPad * 0.5);
  const width = Math.abs(Number(box.w || 0));
  const height = Math.abs(Number(box.h || 0));
  if (height >= width) {
    const y1 = Math.min(Number(box.y), Number(box.y) + Number(box.h || 0));
    return { x: Number(box.x) - perpendicularPad, y: y1 - endPad, w: perpendicularPad * 2, h: height + endPad * 2 };
  }
  const x1 = Math.min(Number(box.x), Number(box.x) + Number(box.w || 0));
  return { x: x1 - endPad, y: Number(box.y) - perpendicularPad, w: width + endPad * 2, h: perpendicularPad * 2 };
}
function collectWorstComponentPrimitiveTargets(deck, visualQuality, maximumTargets = 24, targetKinds = null) {
  const priorityIds = componentWorstPriority(visualQuality);
  if (priorityIds.size < 1 || !Array.isArray(deck?.pages)) return [];
  const targets = [];
  const allowedKinds = Array.isArray(targetKinds) && targetKinds.length > 0 ? new Set(targetKinds.map((kind) => String(kind))) : null;
  for (let pageIndex = 0; pageIndex < deck.pages.length; pageIndex += 1) {
    const page = deck.pages[pageIndex];
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (allowedKinds && !allowedKinds.has("shape")) continue;
      const key = `${pageIndex}:${String(shape?.id || "")}`;
      if (!priorityIds.has(key)) continue;
      const box = componentFidelityTargetBox(shape);
      if (box) targets.push({
        pageIndex,
        id: String(shape.id),
        kind: "shape",
        role: componentWorstRole(visualQuality, pageIndex, shape.id),
        box,
        geometryBox: isFiniteBox(shape.box) ? { ...shape.box } : null,
        strokeWidthPt: Number.isFinite(Number(shape?.style?.strokeWidthPt)) ? Number(shape.style.strokeWidthPt) : null,
        priority: priorityIds.get(key)
      });
    }
    for (const textBox of Array.isArray(page?.textBoxes) ? page.textBoxes : []) {
      if (allowedKinds && !allowedKinds.has("text")) continue;
      const key = `${pageIndex}:${String(textBox?.id || "")}`;
      if (!priorityIds.has(key)) continue;
      const box = componentFidelityTargetBox(textBox);
      if (box) targets.push({ pageIndex, id: String(textBox.id), kind: "text", role: componentWorstRole(visualQuality, pageIndex, textBox.id), box, priority: priorityIds.get(key) });
    }
  }
  for (const item of Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : []) {
    if (allowedKinds && !allowedKinds.has("missing")) continue;
    if (item?.role !== "missing-native-component" || item?.kind !== "missing") continue;
    if (!Number.isSafeInteger(item.pageIndex) || !deck.pages[item.pageIndex] || typeof item.id !== "string" || !item.id) continue;
    const key = `${item.pageIndex}:${item.id}`;
    if (!priorityIds.has(key) || targets.some((target) => target.pageIndex === item.pageIndex && target.id === item.id)) continue;
    if (!isFiniteBox(item.box) || Number(item.box.w) <= 0 || Number(item.box.h) <= 0) continue;
    targets.push({
      pageIndex: item.pageIndex,
      id: item.id,
      kind: "missing",
      role: "missing-native-component",
      box: { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) },
      priority: priorityIds.get(key)
    });
  }
  return targets.sort((left, right) => left.priority - right.priority).slice(0, Math.max(0, maximumTargets));
}
function componentWorstRole(visualQuality, pageIndex, id) {
  const rows = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : [];
  const found = rows.find((item) => item?.pageIndex === pageIndex && item?.id === id);
  return typeof found?.role === "string" ? found.role : null;
}
function mergeVerticalComponentPrimitiveRuns(runs, scaleX, scaleY, target, limit) {
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
  return merged
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, Math.max(0, limit))
    .sort((left, right) => left.firstY - right.firstY || left.start - right.start || left.length - right.length)
    .map((run) => ({
      type: "rect",
      box: { x: run.start / scaleX, y: run.firstY / scaleY, w: run.length / scaleX, h: (run.lastY - run.firstY + 1) / scaleY },
      style: { fill: run.fill },
      sourceComponentId: target.id,
      sourceComponentKind: target.kind
    }));
}
function sourceComponentFidelityPrimitiveRuns({ target, source, rendered, slideSize, maximumRuns, currentRuns }) {
  if (!target?.box || !source || !rendered || !slideSize) return { shapes: [], skippedRuns: 0 };
  const scaleX = source.width / slideSize.widthPt; const scaleY = source.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor((target.box.x - 1) * scaleX));
  const top = Math.max(0, Math.floor((target.box.y - 1) * scaleY));
  const right = Math.min(source.width, Math.ceil((target.box.x + target.box.w + 1) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((target.box.y + target.box.h + 1) * scaleY));
  if (right <= left || bottom <= top || (right - left) * (bottom - top) > 180_000) return { shapes: [], skippedRuns: 0 };
  const shapes = [];
  let skippedRuns = 0;
  const remainingRuns = maximumRuns - currentRuns;
  if (remainingRuns < 1) return { shapes, skippedRuns };
  const minimumRunLength = target.role === "container-border" || target.role === "connector-straight" ? 1 : 2;
  for (let y = top; y < bottom; y += 1) {
    let x = left;
    while (x < right) {
      const slideX = (x + 0.5) / scaleX;
      const slideY = (y + 0.5) / scaleY;
      if (!insideComponentPrimitiveTargetGeometry(slideX, slideY, target)) {
        x += 1;
        continue;
      }
      if (!sourceComponentFidelityForeground(source, rendered, x, y) || sourceRenderedDelta(source, rendered, x, y) <= 5) {
        x += 1;
        continue;
      }
      const fill = sourcePixelHex(source, x, y);
      const start = x;
      let score = sourceRenderedDelta(source, rendered, x, y);
      x += 1;
      while (x < right) {
        const nextSlideX = (x + 0.5) / scaleX;
        const nextSlideY = (y + 0.5) / scaleY;
        if (!insideComponentPrimitiveTargetGeometry(nextSlideX, nextSlideY, target)) break;
        const nextDelta = sourceRenderedDelta(source, rendered, x, y);
        if (!sourceComponentFidelityForeground(source, rendered, x, y) || nextDelta <= 5 || sourcePixelHex(source, x, y) !== fill) break;
        score += nextDelta;
        x += 1;
      }
      const length = x - start;
      if (length < minimumRunLength) {
        skippedRuns += 1;
        continue;
      }
      shapes.push({
        start,
        y,
        length,
        fill,
        score
      });
    }
  }
  return { shapes: mergeVerticalComponentPrimitiveRuns(shapes, scaleX, scaleY, target, remainingRuns), skippedRuns };
}
function insideComponentPrimitiveTargetGeometry(slideX, slideY, target) {
  if (target?.role !== "container-border") return true;
  const box = target.geometryBox || target.box;
  if (!box) return true;
  const strokeWidthPt = Number(target.strokeWidthPt);
  const corridorPt = Math.max(2, Math.min(8, (Number.isFinite(strokeWidthPt) && strokeWidthPt > 0 ? strokeWidthPt : 1) * 1.75 + 1));
  const horizontal = slideX >= box.x - corridorPt
    && slideX <= box.x + box.w + corridorPt
    && (Math.abs(slideY - box.y) <= corridorPt || Math.abs(slideY - box.y - box.h) <= corridorPt);
  const vertical = slideY >= box.y
    && slideY <= box.y + box.h
    && (Math.abs(slideX - box.x) <= corridorPt || Math.abs(slideX - box.x - box.w) <= corridorPt);
  return horizontal || vertical;
}
function fitDeckWorstComponentFidelityPrimitives(deck, options = {}) {
  const next = structuredClone(deck);
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const renderedImages = Array.isArray(options.renderedImages) ? options.renderedImages : [];
  const maximumRuns = Number.isSafeInteger(options.maximumRuns) && options.maximumRuns > 0 ? Math.min(options.maximumRuns, COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS) : 1200;
  const maximumTargets = Number.isSafeInteger(options.maximumTargets) && options.maximumTargets > 0 ? Math.min(options.maximumTargets, 48) : 36;
  const targetKinds = Array.isArray(options.targetKinds) ? options.targetKinds : null;
  const targets = collectWorstComponentPrimitiveTargets(next, options.visualQuality, maximumTargets, targetKinds);
  let addedShapes = 0; let skippedRuns = 0; let candidateComponents = 0;
  const loaded = new Map();
  function pageImages(pageIndex) {
    if (loaded.has(pageIndex)) return loaded.get(pageIndex);
    const files = { sourceFile: sourceImages[pageIndex], renderedFile: renderedImages[pageIndex] };
    if (!files.sourceFile || !files.renderedFile) return null;
    const images = { source: readPng(files.sourceFile), rendered: readPng(files.renderedFile) };
    loaded.set(pageIndex, images);
    return images;
  }
  for (const target of targets) {
    if (addedShapes >= maximumRuns) break;
    const page = next.pages[target.pageIndex];
    const images = pageImages(target.pageIndex);
    if (!page || !images) continue;
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const runs = sourceComponentFidelityPrimitiveRuns({ target, source: images.source, rendered: images.rendered, slideSize: next.slideSize, maximumRuns, currentRuns: addedShapes });
    skippedRuns += runs.skippedRuns;
    if (runs.shapes.length < 1) continue;
    candidateComponents += 1;
    for (const run of runs.shapes) {
      page.shapes.push({
        id: `component-fidelity-native-run-${target.pageIndex + 1}-${addedShapes + 1}`,
        type: "rect",
        box: run.box,
        style: run.style,
        source: {
          detector: "component-fidelity-native-primitive",
          componentQualityIgnore: true,
          sourceComponentId: run.sourceComponentId,
          sourceComponentKind: run.sourceComponentKind
        }
      });
      addedShapes += 1;
    }
  }
  if (addedShapes > 0) {
    next.meta = { ...(next.meta || {}), finalWorstComponentFidelityPrimitiveFit: { provider: "worker-final-worst-component-fidelity-primitive-fit-v1", addedShapes, candidateComponents, candidateTargets: targets.length, skippedRuns: Math.min(skippedRuns, 100_000), skippedRunsTruncated: skippedRuns > 100_000 } };
  }
  return { deck: next, addedShapes, candidateComponents, candidateTargets: targets.length, skippedRuns };
}

function fitDeckMissingNativeVisualAtomShapes(deck, options = {}) {
  if (options.repairMode !== undefined && !["all", "curves-only", "diagonals-only"].includes(options.repairMode)) {
    throw new TypeError("Invalid missing native repair mode");
  }
  const curvesOnly = options.repairMode === "curves-only";
  const diagonalsOnly = options.repairMode === "diagonals-only";
  const next = structuredClone(deck);
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const renderedImages = Array.isArray(options.renderedImages) ? options.renderedImages : [];
  const maximumTargets = Number.isSafeInteger(options.maximumTargets) && options.maximumTargets > 0 ? Math.min(options.maximumTargets, 40) : 24;
  const maximumAtoms = Number.isSafeInteger(options.maximumAtoms) && options.maximumAtoms > 0 ? Math.min(options.maximumAtoms, 120) : 48;
  const paddingPt = Number.isFinite(Number(options.paddingPt)) ? Math.max(0, Math.min(40, Number(options.paddingPt))) : 8;
  const targets = collectMissingNativeVisualAtomTargets(next, options.visualQuality, maximumTargets, {
    cluster: options.clusterMissingTargets !== false
  });
  const loaded = new Map();
  let addedShapes = 0; let candidateTargets = 0; let candidateAtoms = 0;
  const changedComponentKeys = [];
  const usedObjectIds = new Set((Array.isArray(next?.pages) ? next.pages : []).flatMap(page =>
    [page.shapes, page.images, page.textBoxes, page.icons, page.tables, page.charts].flatMap(items =>
      (Array.isArray(items) ? items : []).map(item => item?.id).filter(id => typeof id === "string"))));
  function generatedMissingId(preferred) {
    let id = preferred, suffix = 1;
    while (usedObjectIds.has(id)) {
      if (suffix > 10000) throw new RangeError("missing native object identity limit exceeded");
      id = `${preferred}-r${suffix++}`;
    }
    usedObjectIds.add(id);
    return id;
  }
  function pageImage(pageIndex) {
    if (loaded.has(pageIndex)) return loaded.get(pageIndex);
    const sourceFile = sourceImages[pageIndex];
    if (!sourceFile) return null;
    const image = {
      source: readPng(sourceFile),
      rendered: renderedImages[pageIndex] ? readPng(renderedImages[pageIndex]) : null
    };
    loaded.set(pageIndex, image);
    return image;
  }
  for (const target of targets) {
    if (candidateAtoms >= maximumAtoms) break;
    const page = next.pages[target.pageIndex];
    const images = pageImage(target.pageIndex);
    const source = images?.source;
    if (!page || !source || !next.slideSize) continue;
    page.shapes = Array.isArray(page.shapes) ? page.shapes : [];
    let emittedForTarget = 0;
    const targetLineBundle = curvesOnly || diagonalsOnly ? null : missingNativeTargetLineBundle(target, source, next.slideSize);
    const targetInkRuns = maximumTargets === 1 && targetLineBundle?.source?.detector === "missing-native-oval-component"
      ? missingNativeTargetInkRunShapes(target, source, next.slideSize, images?.rendered, Math.min(16, Math.max(0, maximumAtoms - candidateAtoms)))
      : [];
    const targetSinglePrimitiveShapes = diagonalsOnly ? missingNativeTargetDiagonalShapes(target, source, next.slideSize)
      : curvesOnly || targetLineBundle ? [] : missingNativeTargetSinglePrimitiveShapes(target, source, next.slideSize);
    const targetSinglePrimitiveInkRuns = maximumTargets === 1 && images?.rendered
      && targetSinglePrimitiveShapes.some((shape) => shape?.source?.detector === "missing-native-oval-component")
      ? missingNativeTargetInkRunShapes(target, source, next.slideSize, images.rendered, Math.min(16, Math.max(0, maximumAtoms - candidateAtoms)))
      : [];
    if (targetInkRuns.length > 0) {
      for (const inkRunShape of targetInkRuns) {
        if (candidateAtoms >= maximumAtoms) break;
        page.shapes.push({
          ...inkRunShape,
          id: generatedMissingId(`missing-native-ink-run-component-${target.pageIndex + 1}-${addedShapes + 1}`)
        });
        addedShapes += 1;
        emittedForTarget += 1;
        candidateAtoms += 1;
        const ids = Array.isArray(inkRunShape.source?.sourceMissingNativeComponentIds) ? inkRunShape.source.sourceMissingNativeComponentIds : [target.id];
        for (const id of ids) {
          if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
        }
      }
      candidateTargets += 1;
      continue;
    }
    if (targetSinglePrimitiveInkRuns.length > 0) {
      for (const inkRunShape of targetSinglePrimitiveInkRuns) {
        if (candidateAtoms >= maximumAtoms) break;
        page.shapes.push({
          ...inkRunShape,
          id: generatedMissingId(`missing-native-ink-run-component-${target.pageIndex + 1}-${addedShapes + 1}`)
        });
        addedShapes += 1;
        emittedForTarget += 1;
        candidateAtoms += 1;
        const ids = Array.isArray(inkRunShape.source?.sourceMissingNativeComponentIds) ? inkRunShape.source.sourceMissingNativeComponentIds : [target.id];
        for (const id of ids) {
          if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
        }
      }
      candidateTargets += 1;
      continue;
    }
    for (const primitiveShape of targetSinglePrimitiveShapes) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...primitiveShape,
        id: generatedMissingId(`missing-native-single-primitive-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(primitiveShape.source?.sourceMissingNativeComponentIds) ? primitiveShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    if (emittedForTarget > 0) {
      candidateTargets += 1;
      continue;
    }
    if (diagonalsOnly) continue;
    if (targetLineBundle && candidateAtoms < maximumAtoms) {
      page.shapes.push({
        ...targetLineBundle,
        id: generatedMissingId(`missing-native-line-bundle-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      candidateTargets += 1;
      candidateAtoms += Math.max(1, Number(targetLineBundle.source?.bundledVisualAtomCount || 1));
      const sourceIds = Array.isArray(target.sourceIds) && target.sourceIds.length > 0 ? target.sourceIds : [target.id];
      for (const id of sourceIds) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
      continue;
    }
    for (const ovalShape of curvesOnly ? [] : missingNativeTargetOvalShapes(target, source, next.slideSize)) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...ovalShape,
        id: generatedMissingId(`missing-native-oval-component-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(ovalShape.source?.sourceMissingNativeComponentIds) ? ovalShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    for (const curveShape of missingNativeTargetCurveShapes(target, source, next.slideSize, images?.rendered)) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...curveShape,
        id: generatedMissingId(`missing-native-curve-component-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(curveShape.source?.sourceMissingNativeComponentIds) ? curveShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    if (emittedForTarget > 0) {
      candidateTargets += 1;
      continue;
    }
    if (curvesOnly) continue;
    for (const blobShape of missingNativeTargetBlobShapes(target, source, next.slideSize, images?.rendered)) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...blobShape,
        id: generatedMissingId(`missing-native-blob-component-${target.pageIndex + 1}-${addedShapes + 1}`)
      });
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += 1;
      const ids = Array.isArray(blobShape.source?.sourceMissingNativeComponentIds) ? blobShape.source.sourceMissingNativeComponentIds : [target.id];
      for (const id of ids) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
    if (emittedForTarget > 0) {
      candidateTargets += 1;
      continue;
    }
    const searchBox = expandPtBox(target.box, paddingPt, next.slideSize);
    const atoms = extractVisualAtoms(source, searchBox, next.slideSize, {
      maxAtoms: Math.max(4, Math.min(20, maximumAtoms - candidateAtoms)),
      textBoxes: Array.isArray(page.textBoxes) ? page.textBoxes : []
    })
      .filter((atom) => atom?.nativeCandidate === true && atom?.residualCandidate !== true && isFiniteBox(atom.box))
      .filter(isReliableMissingNativeVisualAtom)
      .filter((atom) => !images?.rendered || visualAtomMissingInRendered(atom, source, images.rendered, next.slideSize))
      .filter((atom) => options.constrainAtomsToTargetBox === false || visualAtomOverlapsMissingTarget(atom, target.box));
    if (atoms.length < 1) continue;
    const sourceLayer = {
      id: target.id,
      source: {
        layer: {
          layerType: "diagram-zone",
          diagramUnderstanding: {
            archetype: "missing-native-component",
            visualAtoms: atoms
          }
        }
      }
    };
    const curveBundles = missingNativeVisualAtomCurveBundles(atoms, target);
    const lineBundles = missingNativeVisualAtomLineBundles(atoms, target);
    const bundledAtomIds = new Set();
    for (const bundle of curveBundles) {
      if (candidateAtoms >= maximumAtoms) break;
      page.shapes.push({
        ...bundle.shape,
        id: generatedMissingId(`missing-native-curve-bundle-${target.pageIndex + 1}-${addedShapes + 1}`),
        source: {
          ...(bundle.shape.source || {}),
          missingNativeComponentId: target.id,
          sourceMissingNativeComponentIds: [...(target.sourceIds || [target.id])]
        }
      });
      for (const atomId of bundle.atomIds) bundledAtomIds.add(atomId);
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += bundle.atomIds.length;
    }
    for (const bundle of lineBundles) {
      if (candidateAtoms >= maximumAtoms) break;
      if (bundle.atomIds.every((atomId) => bundledAtomIds.has(atomId))) continue;
      page.shapes.push({
        ...bundle.shape,
        id: generatedMissingId(`missing-native-line-bundle-${target.pageIndex + 1}-${addedShapes + 1}`),
        source: {
          ...(bundle.shape.source || {}),
          missingNativeComponentId: target.id,
          sourceMissingNativeComponentIds: [...(target.sourceIds || [target.id])]
        }
      });
      for (const atomId of bundle.atomIds) bundledAtomIds.add(atomId);
      addedShapes += 1;
      emittedForTarget += 1;
      candidateAtoms += bundle.atomIds.length;
    }
    for (const atom of atoms) {
      if (candidateAtoms >= maximumAtoms) break;
      if (bundledAtomIds.has(String(atom.id || ""))) continue;
      const atomWithId = { ...atom, id: `${target.id}-${atom.id || candidateAtoms + 1}` };
      const atomVariants = missingNativeVisualAtomVariants(atomWithId, target);
      for (const atomVariant of atomVariants) {
        if (candidateAtoms >= maximumAtoms) break;
        const shape = missingNativeVisualAtomShape(sourceLayer, atomVariant, candidateAtoms, sourceLayer.source.layer.diagramUnderstanding);
        const shapes = Array.isArray(shape) ? shape.filter(Boolean) : shape ? [shape] : [];
        for (const item of shapes) {
          if (!item || !isFiniteVisualAtomShapeBox(item)) continue;
          page.shapes.push({
            ...item,
            id: generatedMissingId(`missing-native-visual-atom-${target.pageIndex + 1}-${addedShapes + 1}`),
            source: {
              ...(item.source || {}),
              detector: item.source?.detector || "missing-native-visual-atom",
              missingNativeComponentId: target.id,
              sourceMissingNativeComponentIds: [...(target.sourceIds || [target.id])]
            }
          });
          addedShapes += 1;
          emittedForTarget += 1;
        }
        candidateAtoms += 1;
      }
    }
    if (emittedForTarget < 1) {
      for (const inkRunShape of missingNativeTargetInkRunShapes(target, source, next.slideSize, images?.rendered, Math.max(0, maximumAtoms - candidateAtoms))) {
        if (candidateAtoms >= maximumAtoms) break;
        page.shapes.push({
          ...inkRunShape,
          id: generatedMissingId(`missing-native-ink-run-component-${target.pageIndex + 1}-${addedShapes + 1}`)
        });
        addedShapes += 1;
        emittedForTarget += 1;
        candidateAtoms += 1;
        const ids = Array.isArray(inkRunShape.source?.sourceMissingNativeComponentIds) ? inkRunShape.source.sourceMissingNativeComponentIds : [target.id];
        for (const id of ids) {
          if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
        }
      }
    }
    if (emittedForTarget > 0) candidateTargets += 1;
    if (emittedForTarget > 0) {
      const sourceIds = Array.isArray(target.sourceIds) && target.sourceIds.length > 0 ? target.sourceIds : [target.id];
      for (const id of sourceIds) {
        if (typeof id === "string" && id) changedComponentKeys.push(`${target.pageIndex}:${id}`);
      }
    }
  }
  if (addedShapes > 0) {
    next.meta = { ...(next.meta || {}), finalMissingNativeVisualAtomFit: { provider: "worker-final-missing-native-visual-atom-fit-v1", addedShapes, candidateTargets, candidateAtoms, changedComponentKeys } };
  }
  return { deck: next, addedShapes, candidateTargets, candidateAtoms, changedComponentKeys };
}

function isReliableMissingNativeVisualAtom(atom) {
  const kind = String(atom?.kind || "");
  const confidence = Number(atom?.density ?? atom?.confidence);
  if (!Number.isFinite(confidence)) return false;
  if (kind === "connector-arrow-candidate") return confidence >= 0.58;
  if (kind === "connector-line-candidate") return confidence >= 0.58;
  if (kind === "grid-line-candidate") return confidence >= 0.68;
  return confidence >= 0.62;
}

function missingNativeTargetLineBundle(target, source, slideSize) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) ? target.sourceBoxes : [];
  const boxes = sourceBoxes.map((item) => item?.box).filter(isFiniteBox);
  if (boxes.length === 1) return null;
  if (boxes.length < 2) return null;
  const unionBox = unionManyPtBoxes(boxes);
  const orientation = boxDominantOrientation(unionBox);
  if (orientation !== "horizontal" && orientation !== "vertical") return null;
  if (boxes.some((box) => boxDominantOrientation(box) !== orientation)) return null;
  const color = sampleMissingNativeLineColor(source, unionBox, slideSize) || normalizedVisualAtomColor(target.color);
  const group = { orientation, color, boxes, atomIds: new Set(sourceBoxes.map((item) => String(item?.id || "")).filter(Boolean)) };
  const bundle = lineAtomBundleShape(group, target);
  if (!bundle) return null;
  return {
    ...bundle.shape,
    source: {
      ...bundle.shape.source,
      detector: "missing-native-line-bundle",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : []
    }
  };
}

function missingNativeTargetInkRunShapes(target, source, slideSize, rendered = null, maximumRuns = 12) {
  if (!target || !source || !rendered || !slideSize || !Number.isSafeInteger(maximumRuns) || maximumRuns < 1) return [];
  const sourceBoxes = Array.isArray(target.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target.id || null, box: target.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (shapes.length >= maximumRuns) break;
    if (!isFiniteBox(item?.box)) continue;
    const targetId = typeof item.id === "string" && item.id ? item.id : target.id;
    const runs = sourceComponentFidelityPrimitiveRuns({
      target: {
        ...target,
        id: targetId,
        kind: "missing",
        role: "missing-native-component",
        box: item.box
      },
      source,
      rendered,
      slideSize,
      maximumRuns,
      currentRuns: shapes.length
    });
    for (const runShape of runs.shapes) {
      if (shapes.length >= maximumRuns) break;
      if (!isFiniteBox(runShape.box) || runShape.box.w * runShape.box.h < 0.08) continue;
      shapes.push({
        type: "rect",
        box: {
          x: round(Number(runShape.box.x)),
          y: round(Number(runShape.box.y)),
          w: round(Number(runShape.box.w)),
          h: round(Number(runShape.box.h))
        },
        style: {
          fill: runShape.style?.fill || normalizedVisualAtomColor(target.color) || "#111111",
          stroke: "none",
          strokeWidthPt: 0
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "missing-native-ink-run-component",
          missingNativeComponentId: target.id,
          sourceMissingNativeComponentIds: [targetId].filter(Boolean),
          componentQualityRole: "shape",
          semanticNativeStructure: true,
          sourceDetector: target.source?.detector || null
        }
      });
    }
  }
  return shapes;
}

function missingNativeTargetSinglePrimitiveShapes(target, source, slideSize) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (!isFiniteBox(item?.box)) continue;
    const sampledColor = sampleMissingNativeLineColor(source, item.box, slideSize);
    if (!sampledColor) continue;
    const targetId = typeof item.id === "string" && item.id ? item.id : target.id;
    const scopedTarget = {
      ...target,
      id: targetId,
      color: sampledColor,
      sourceIds: [targetId].filter(Boolean)
    };
    const primitive = missingNativeSingleDiagonalShape(scopedTarget, item.box, source, slideSize)
      || missingNativeSingleLineShape(scopedTarget, item.box, source, slideSize)
      || missingNativeSingleOvalShape(scopedTarget, item.box, source, slideSize)
      || missingNativeSingleTinyRectShape(scopedTarget, item.box, source, slideSize);
    if (primitive) shapes.push(primitive);
  }
  return shapes;
}

function missingNativeTargetDiagonalShapes(target, source, slideSize) {
  const boxes = Array.isArray(target.sourceBoxes) && target.sourceBoxes.length ? target.sourceBoxes : [{ id: target.id, box: target.box }];
  return boxes.map(item => missingNativeSingleDiagonalShape({ ...target, id: item.id, sourceIds: [item.id] }, item.box, source, slideSize)).filter(Boolean);
}

function missingNativeSingleDiagonalShape(target, box, image, slideSize) {
  const contour = traceDiagonalConnectorFromRaster({ image, box, slideSize });
  if (!contour) return null;
  return { type: "freeform", box: contour.box,
    style: { fill: contour.color, stroke: "none", strokeWidthPt: 0, freeformSegments: contour.segments },
    source: { editable: true, nativeRebuild: true, detector: "missing-native-diagonal-connector-contour",
      componentQualityRole: "connector-straight", semanticNativeStructure: true,
      missingNativeComponentId: target.id, sourceMissingNativeComponentIds: target.sourceIds,
      diagonalConnectorEvidence: contour.evidence }
  };
}

function missingNativeTargetBlobShapes(target, source, slideSize, rendered = null) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (!isFiniteBox(item?.box)) continue;
    for (const shape of missingNativeBlobFreeformShapes({ ...target, id: item.id || target.id, sourceIds: [item.id || target.id].filter(Boolean) }, item.box, source, slideSize, rendered)) {
      shapes.push(shape);
    }
  }
  return shapes;
}

function missingNativeTargetCurveShapes(target, source, slideSize, rendered = null) {
  if (Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 1) {
    return missingNativeCurveFreeformShapes(target, target.box, source, slideSize, rendered);
  }
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  const shapes = [];
  for (const item of sourceBoxes) {
    if (!isFiniteBox(item?.box)) continue;
    for (const shape of missingNativeCurveFreeformShapes({ ...target, id: item.id || target.id, sourceIds: [item.id || target.id].filter(Boolean) }, item.box, source, slideSize, rendered)) {
      shapes.push(shape);
    }
  }
  return shapes;
}

function missingNativeCurveFreeformShapes(target, box, source, slideSize, _rendered = null) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return [];
  if (box.w * box.h > 25000) return [];
  // Once a missing relationship is targeted, recover its complete source ink.
  // A difference-only mask can sever a curve at an already matching middle.
  return missingNativeBlobEvidence(source, box, slideSize, null, { maximumComponentAreaPt2: 25000 })
    .filter((evidence) => isSparseCurveEvidence(evidence))
    .map((evidence, index) => missingNativeCurveFreeformShape(target, evidence, index))
    .filter(Boolean);
}

function isSparseCurveEvidence(evidence) {
  if (!evidence || !isFiniteBox(evidence.box)) return false;
  const width = Number(evidence.box.w);
  const height = Number(evidence.box.h);
  const area = width * height;
  if (!Number.isFinite(area) || area < 800 || area > 25000) return false;
  if (width < 22 || height < 18) return false;
  const aspect = width / Math.max(1e-6, height);
  if (aspect < 0.45 || aspect > 2.8) return false;
  const density = Number(evidence.density);
  if (!Number.isFinite(density) || density < 0.025 || density > 0.18) return false;
  if (Number(evidence.pixelCount || 0) < 45) return false;
  const parsed = hexColor(evidence.color);
  return parsed && brightness(parsed) < 245 && saturationProxy(parsed) >= 28;
}

function missingNativeCurveFreeformShape(target, evidence, index) {
  const contour = evidence.connectorContour;
  if (!contour) return null;
  const color = evidence.color;
  return {
    type: "freeform",
    box: {
      x: round(Number(evidence.box.x)),
      y: round(Number(evidence.box.y)),
      w: round(Number(evidence.box.w)),
      h: round(Number(evidence.box.h))
    },
    points: contour.segments.flatMap((segment) => segment.points),
    style: {
      fill: color,
      stroke: "none",
      strokeWidthPt: 0,
      closePath: true,
      freeformSegments: contour.segments
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-curve-freeform-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "connector-curve",
      semanticNativeStructure: true,
      sourceContourTolerancePx: contour.tolerancePx,
      sourceContourPixels: contour.pixelCount,
      contourIndex: index + 1
    }
  };
}


function missingNativeBlobFreeformShapes(target, box, source, slideSize, rendered = null) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return [];
  const width = Number(box.w);
  const height = Number(box.h);
  const area = width * height;
  if (!Number.isFinite(area) || area < 120 || area > 9000) return [];
  if (boxDominantOrientation(box) !== "block") return [];
  const components = missingNativeBlobEvidence(source, box, slideSize, rendered);
  return components.filter((evidence) => Number(evidence.density) >= 0.08 && boxDominantOrientation(evidence.box) === "block").map((evidence, index) => {
    if (!evidence || evidence.points.length < 3 || !isFiniteBox(evidence.box)) return null;
    const parsed = hexColor(evidence.color);
    if (!parsed || brightness(parsed) > 245 || saturationProxy(parsed) < 24) return null;
    return {
    type: "freeform",
    box: {
      x: round(Number(evidence.box.x)),
      y: round(Number(evidence.box.y)),
      w: round(Number(evidence.box.w)),
      h: round(Number(evidence.box.h))
    },
    points: evidence.nativeContour ? evidence.nativeContour.segments.flatMap(segment=>segment.points) : evidence.points,
    style: {
      fill: evidence.color,
      stroke: evidence.color,
      strokeWidthPt: 0,
      ...(evidence.nativeContour ? {closePath:true,freeformSegments:evidence.nativeContour.segments} : {})
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-blob-freeform-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "shape",
      semanticNativeStructure: true,
      contourIndex: index + 1,
      ...(evidence.nativeContour ? {sourceContourTolerancePx:evidence.nativeContour.tolerancePx} : {})
    }
  };
  }).filter(Boolean);
}

function missingNativeBlobEvidence(source, box, slideSize, rendered = null, options = {}) {
  if (!source || !Buffer.isBuffer(source.rgba) || !isFiniteBox(box) || !slideSize) return [];
  const scaleX = source.width / Number(slideSize.widthPt);
  const scaleY = source.height / Number(slideSize.heightPt);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return [];
  const left = Math.max(0, Math.floor(Number(box.x) * scaleX));
  const top = Math.max(0, Math.floor(Number(box.y) * scaleY));
  const right = Math.min(source.width, Math.ceil((Number(box.x) + Number(box.w)) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((Number(box.y) + Number(box.h)) * scaleY));
  if (right <= left || bottom <= top) return [];
  const width = right - left;
  const height = bottom - top;
  if (width * height > 1_000_000) return [];
  const foreground = new Uint8Array(width * height);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * source.width + x) * 4;
      const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2] };
      const renderedColor = rendered && rendered.width === source.width && rendered.height === source.height
        ? pixelColor(rendered, x, y)
        : null;
      if (!isMissingNativeBlobForeground(color, renderedColor)) continue;
      foreground[(y - top) * width + (x - left)] = 1;
    }
  }
  const maximumComponentAreaPt2 = options.maximumComponentAreaPt2 ?? 9000;
  if (!Number.isFinite(maximumComponentAreaPt2) || maximumComponentAreaPt2 < 12 || maximumComponentAreaPt2 > 25000) {
    throw new TypeError("Invalid missing native component area boundary");
  }
  return connectedMissingNativeBlobComponents({ source, foreground, left, top, width, height, scaleX, scaleY, maximumComponentAreaPt2 })
    .filter((component) => component.points.length >= 3)
    .sort((leftComponent, rightComponent) => rightComponent.pixelCount - leftComponent.pixelCount)
    .slice(0, 8)
    .map((component) => ({
      color: component.color,
      box: component.box,
      pixelCount: component.pixelCount,
      density: component.density,
      curve: component.curve,
      connectorContour: component.connectorContour,
      nativeContour: component.nativeContour,
      points: component.points
    }));
}

function isMissingNativeBlobForeground(color, renderedColor = null) {
  const bright = brightness(color);
  const sat = saturationProxy(color);
  if (bright >= 248) return false;
  if (sat < 28) return false;
  if (renderedColor && colorDistance(color, renderedColor) < 28) return false;
  return bright < 242 || sat >= 40;
}


function sparseCurveControlPoints(pixels, minX, minY, width, height) {
  if (!Array.isArray(pixels) || pixels.length < 3 || width <= 1 || height <= 1) return null;
  const normalized = pixels.map((pixel) => ({
    x: (pixel.x - minX) / Math.max(1, width - 1),
    y: (pixel.y - minY) / Math.max(1, height - 1)
  }));
  const left = averageBand(normalized, (point) => point.x <= 0.25) || minBy(normalized, (point) => point.x);
  const right = averageBand(normalized, (point) => point.x >= 0.75) || maxBy(normalized, (point) => point.x);
  const middle = averageBand(normalized, (point) => point.x > 0.35 && point.x < 0.65) || averagePoint(normalized);
  if (!left || !right || !middle) return null;
  const endpointY = (left.y + right.y) / 2;
  const bendY = middle.y < endpointY ? Math.max(0, middle.y - 0.08) : Math.min(1, middle.y + 0.08);
  return {
    start: { x: clampUnit(left.x), y: clampUnit(left.y) },
    control1: { x: clampUnit(0.32), y: clampUnit(bendY) },
    control2: { x: clampUnit(0.68), y: clampUnit(bendY) },
    end: { x: clampUnit(right.x), y: clampUnit(right.y) }
  };
}

function averageBand(points, predicate) {
  return averagePoint(points.filter(predicate));
}

function averagePoint(points) {
  if (!Array.isArray(points) || points.length < 1) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function minBy(points, score) {
  return points.reduce((best, point) => !best || score(point) < score(best) ? point : best, null);
}

function maxBy(points, score) {
  return points.reduce((best, point) => !best || score(point) > score(best) ? point : best, null);
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${round(point.x)}:${round(point.y)}`, { x: point.x, y: point.y }])).values()]
    .sort((left, right) => left.x - right.x || left.y - right.y);
  if (unique.length <= 3) return unique;
  const cross = (origin, left, right) => (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of unique.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function simplifyHullPoints(points, limit) {
  if (!Array.isArray(points) || points.length <= limit) return points || [];
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return points
    .map((point, index) => ({ point, index, distance: Math.hypot(point.x - cx, point.y - cy) }))
    .sort((left, right) => right.distance - left.distance)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.point);
}

function missingNativeSingleTinyRectShape(target, box, source, slideSize) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return null;
  const width = Number(box.w);
  const height = Number(box.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) > 22 || Math.min(width, height) > 7) return null;
  if (boxDominantOrientation(box) !== "block") return null;
  const color = sampleMissingNativeLineColor(source, box, slideSize) || normalizedVisualAtomColor(target.color);
  const parsed = hexColor(color);
  if (!parsed || brightness(parsed) > 248) return null;
  return {
    type: "rect",
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(width),
      h: round(height)
    },
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-tiny-rect-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "shape",
      semanticNativeStructure: true
    }
  };
}

function missingNativeSingleLineShape(target, box, source, slideSize) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return null;
  const orientation = boxDominantOrientation(box);
  if (orientation !== "horizontal" && orientation !== "vertical") return null;
  const length = orientation === "horizontal" ? Number(box.w) : Number(box.h);
  const thickness = orientation === "horizontal" ? Number(box.h) : Number(box.w);
  if (!Number.isFinite(length) || !Number.isFinite(thickness) || length < 3 || thickness <= 0 || thickness > 8) return null;
  const color = sampleMissingNativeLineColor(source, box, slideSize) || normalizedVisualAtomColor(target.color);
  const strokeWidthPt = Math.max(0.5, Math.min(4, Math.round(thickness * 100) / 100));
  const line = orientation === "horizontal"
    ? { x: Number(box.x), y: Number(box.y) + Number(box.h) / 2, w: Number(box.w), h: 0 }
    : { x: Number(box.x) + Number(box.w) / 2, y: Number(box.y), w: 0, h: Number(box.h) };
  return {
    type: "line",
    box: {
      x: round(line.x),
      y: round(line.y),
      w: round(line.w),
      h: round(line.h)
    },
    style: {
      stroke: color,
      strokeWidthPt,
      connectorType: "straight"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-line-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "connector-straight",
      axis: orientation,
      semanticNativeStructure: true
    }
  };
}

function missingNativeSingleOvalShape(target, box, source, slideSize) {
  if (!isFiniteBox(target?.box) || !isFiniteBox(box)) return null;
  const width = Number(box.w);
  const height = Number(box.h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 18 || height < 5 || height > 24 || width < height * 2.4 || width > height * 7) return null;
  const color = sampleMissingNativeLineColor(source, box, slideSize) || normalizedVisualAtomColor(target.color);
  const parsed = hexColor(color);
  if (!parsed || saturationProxy(parsed) < 45 || brightness(parsed) > 245) return null;
  return {
    type: "ellipse",
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(width),
      h: round(height)
    },
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-oval-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "shape",
      semanticNativeStructure: true
    }
  };
}

function missingNativeTargetOvalShapes(target, source, slideSize) {
  const sourceBoxes = Array.isArray(target?.sourceBoxes) ? target.sourceBoxes : [];
  if (sourceBoxes.length < 2) return [];
  return sourceBoxes
    .map((item) => {
      const id = String(item?.id || "");
      if (!id || !isFiniteBox(item?.box)) return null;
      return missingNativeSingleOvalShape({ ...target, id, sourceIds: [id] }, item.box, source, slideSize);
    })
    .filter(Boolean);
}

function sampleMissingNativeLineColor(source, box, slideSize) {
  if (!source || !Buffer.isBuffer(source.rgba) || !isFiniteBox(box) || !slideSize) return null;
  const scaleX = source.width / Number(slideSize.widthPt);
  const scaleY = source.height / Number(slideSize.heightPt);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;
  const left = Math.max(0, Math.floor((Number(box.x) - 0.5) * scaleX));
  const top = Math.max(0, Math.floor((Number(box.y) - 0.5) * scaleY));
  const right = Math.min(source.width, Math.ceil((Number(box.x) + Number(box.w) + 0.5) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((Number(box.y) + Number(box.h) + 0.5) * scaleY));
  let r = 0; let g = 0; let b = 0; let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * source.width + x) * 4;
      const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2] };
      const bright = brightness(color);
      const sat = saturationProxy(color);
      if (bright >= 245 && sat <= 18) continue;
      r += color.r; g += color.g; b += color.b; count += 1;
    }
  }
  if (count < 1) return null;
  return rgbToHex({ r: r / count, g: g / count, b: b / count });
}

function missingNativeVisualAtomLineBundles(atoms, target) {
  if (!Array.isArray(atoms) || !isFiniteBox(target?.box)) return [];
  const variants = [];
  for (const atom of atoms) {
    if (!isLineLikeVisualAtom(atom)) continue;
    const atomId = String(atom?.id || "");
    for (const variant of missingNativeVisualAtomVariants(atom, target)) {
      if (!isFiniteBox(variant?.box)) continue;
      const orientation = boxDominantOrientation(variant.box);
      if (orientation !== "horizontal" && orientation !== "vertical") continue;
      variants.push({
        atomId,
        orientation,
        color: normalizedVisualAtomColor(variant.color || atom.color),
        box: variant.box
      });
    }
  }
  if (variants.length < 2) return [];
  const groups = [];
  for (const variant of variants) {
    const group = groups.find((entry) => canMergeLineAtomVariant(entry, variant));
    if (!group) {
      groups.push({ orientation: variant.orientation, color: variant.color, boxes: [variant.box], atomIds: new Set([variant.atomId]) });
      continue;
    }
    group.boxes.push(variant.box);
    group.atomIds.add(variant.atomId);
  }
  return groups
    .map((group) => lineAtomBundleShape(group, target))
    .filter(Boolean)
    .sort((left, right) => right.atomIds.length - left.atomIds.length
      || Math.hypot(right.shape.box.w, right.shape.box.h) - Math.hypot(left.shape.box.w, left.shape.box.h));
}

function missingNativeVisualAtomCurveBundles(atoms, target) {
  if (!Array.isArray(atoms) || !isFiniteBox(target?.box)) return [];
  const variants = [];
  for (const atom of atoms) {
    if (!isLineLikeVisualAtom(atom)) continue;
    const atomId = String(atom?.id || "");
    for (const variant of missingNativeVisualAtomVariants(atom, target)) {
      if (!isFiniteBox(variant?.box) || boxDominantOrientation(variant.box) !== "horizontal") continue;
      variants.push({
        atomId,
        color: normalizedVisualAtomColor(variant.color || atom.color),
        box: variant.box
      });
    }
  }
  if (variants.length < 2) return [];
  const groups = [];
  for (const variant of variants) {
    const group = groups.find((entry) => canMergeCurveAtomVariant(entry, variant));
    if (!group) {
      groups.push({ color: variant.color, boxes: [variant.box], atomIds: new Set([variant.atomId]) });
      continue;
    }
    group.boxes.push(variant.box);
    group.atomIds.add(variant.atomId);
  }
  return groups
    .map((group) => curveAtomBundleShape(group, target))
    .filter(Boolean)
    .sort((left, right) => right.atomIds.length - left.atomIds.length || curveBundleArea(right.shape) - curveBundleArea(left.shape))
    .slice(0, 2);
}

function normalizedVisualAtomColor(color) {
  const value = typeof color === "string" && /^#[0-9a-fA-F]{6}$/u.test(color) ? color.toUpperCase() : "#6B7280";
  return value;
}

function canMergeCurveAtomVariant(group, variant) {
  if (!group || !similarVisualAtomColor(group.color, variant.color)) return false;
  const box = unionManyPtBoxes(group.boxes);
  if (!box) return false;
  const overlap = Math.max(0, Math.min(box.x + box.w, variant.box.x + variant.box.w) - Math.max(box.x, variant.box.x));
  const minWidth = Math.min(box.w, variant.box.w);
  if (minWidth <= 0 || overlap / minWidth < 0.35) return false;
  const groupCy = box.y + box.h / 2;
  const variantCy = variant.box.y + variant.box.h / 2;
  const rowGap = Math.abs(groupCy - variantCy);
  return rowGap >= Math.max(10, Math.min(28, Math.max(box.h, variant.box.h) * 4))
    && rowGap <= Math.max(72, Math.min(180, Math.max(box.w, variant.box.w) * 1.2));
}

function similarVisualAtomColor(left, right) {
  if (left === right) return true;
  const leftColor = hexColor(left);
  const rightColor = hexColor(right);
  if (!leftColor || !rightColor) return false;
  return colorDistance(leftColor, rightColor) <= 48;
}

function curveAtomBundleShape(group, target) {
  const boxes = Array.isArray(group?.boxes) ? group.boxes.filter(isFiniteBox) : [];
  if (boxes.length < 2 || !(group.atomIds instanceof Set) || group.atomIds.size < 2) return null;
  const box = unionManyPtBoxes(boxes);
  if (!box || !visualAtomOverlapsMissingTarget({ box }, target.box)) return null;
  if (box.w < 24 || box.h < 18 || box.w / Math.max(1e-6, box.h) < 0.9) return null;
  const sorted = [...boxes].sort((left, right) => left.y - right.y);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const strokeWidthPt = Math.max(1.1, Math.min(4, medianLineThickness(boxes, "horizontal")));
  const leftAligned = Math.abs(top.x - bottom.x) <= Math.max(8, box.w * 0.22);
  const openSide = leftAligned ? "right" : "left";
  const startX = openSide === "right" ? 0.05 : 0.95;
  const outerX = openSide === "right" ? 0.95 : 0.05;
  const endX = startX;
  const topY = Math.max(0.05, Math.min(0.35, ((top.y + top.h / 2) - box.y) / Math.max(1e-6, box.h)));
  const bottomY = Math.min(0.95, Math.max(0.65, ((bottom.y + bottom.h / 2) - box.y) / Math.max(1e-6, box.h)));
  return {
    atomIds: [...group.atomIds],
    shape: {
      type: "freeform",
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      points: [
        { x: startX, y: topY },
        { x: outerX, y: topY },
        { x: outerX, y: bottomY },
        { x: endX, y: bottomY }
      ],
      style: {
        fill: "none",
        stroke: group.color,
        strokeWidthPt: Math.round(strokeWidthPt * 100) / 100,
        closePath: false,
        lineCap: "round",
        freeformSegments: [
          { type: "moveTo", points: [{ x: startX, y: topY }] },
          { type: "cubicBezTo", points: [{ x: 0.45, y: topY }, { x: outerX, y: 0.35 }, { x: outerX, y: 0.5 }] },
          { type: "cubicBezTo", points: [{ x: outerX, y: 0.65 }, { x: 0.45, y: bottomY }, { x: endX, y: bottomY }] }
        ]
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "missing-native-curve-bundle",
        bundledVisualAtomCount: group.atomIds.size,
        atomIds: [...group.atomIds].slice(0, 20),
        componentQualityRole: "connector-curve",
        semanticNativeStructure: true
      }
    }
  };
}

function curveBundleArea(shape) {
  return Math.abs(Number(shape?.box?.w || 0) * Number(shape?.box?.h || 0));
}

function canMergeLineAtomVariant(group, variant) {
  if (!group || group.orientation !== variant.orientation || group.color !== variant.color) return false;
  const box = unionManyPtBoxes(group.boxes);
  if (!box) return false;
  if (variant.orientation === "horizontal") {
    const groupCy = box.y + box.h / 2;
    const variantCy = variant.box.y + variant.box.h / 2;
    const rowTolerance = Math.max(2, Math.min(8, Math.max(box.h, variant.box.h) * 2.5));
    const gap = Math.max(0, Math.max(box.x, variant.box.x) - Math.min(box.x + box.w, variant.box.x + variant.box.w));
    return Math.abs(groupCy - variantCy) <= rowTolerance && gap <= Math.max(8, Math.min(36, Math.max(box.h, variant.box.h) * 8));
  }
  const groupCx = box.x + box.w / 2;
  const variantCx = variant.box.x + variant.box.w / 2;
  const columnTolerance = Math.max(2, Math.min(8, Math.max(box.w, variant.box.w) * 2.5));
  const gap = Math.max(0, Math.max(box.y, variant.box.y) - Math.min(box.y + box.h, variant.box.y + variant.box.h));
  return Math.abs(groupCx - variantCx) <= columnTolerance && gap <= Math.max(8, Math.min(36, Math.max(box.w, variant.box.w) * 8));
}

function unionManyPtBoxes(boxes) {
  if (!Array.isArray(boxes) || boxes.length < 1) return null;
  return boxes.reduce((acc, box) => acc ? unionPtBoxes(acc, box) : { ...box }, null);
}

function lineAtomBundleShape(group, target) {
  const boxes = Array.isArray(group?.boxes) ? group.boxes.filter(isFiniteBox) : [];
  if (boxes.length < 2 || !(group.atomIds instanceof Set) || group.atomIds.size < 2) return null;
  const box = unionManyPtBoxes(boxes);
  if (!box || !visualAtomOverlapsMissingTarget({ box }, target.box)) return null;
  const thickness = Math.max(0.5, Math.min(4, medianLineThickness(boxes, group.orientation)));
  const sorted = [...boxes].sort((left, right) => group.orientation === "horizontal" ? left.x - right.x : left.y - right.y);
  const hasGaps = lineBoxesHaveGaps(sorted, group.orientation, thickness);
  const style = {
    stroke: group.color,
    strokeWidthPt: Math.round(thickness * 100) / 100,
    connectorType: "straight",
    ...(hasGaps ? { dash: "dash" } : {})
  };
  const line = group.orientation === "horizontal"
    ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
    : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
  return {
    atomIds: [...group.atomIds],
    shape: {
      type: "line",
      box: {
        x: round(line.x),
        y: round(line.y),
        w: round(line.w),
        h: round(line.h)
      },
      style,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "missing-native-line-bundle",
        bundledVisualAtomCount: group.atomIds.size,
        componentQualityRole: "connector-straight",
        atomIds: [...group.atomIds].slice(0, 20),
        axis: group.orientation
      }
    }
  };
}

function medianLineThickness(boxes, orientation) {
  const values = boxes
    .map((box) => Number(orientation === "horizontal" ? box.h : box.w))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (values.length < 1) return 1;
  return values[Math.floor(values.length / 2)];
}

function lineBoxesHaveGaps(boxes, orientation, thickness) {
  for (let index = 1; index < boxes.length; index += 1) {
    const previous = boxes[index - 1];
    const current = boxes[index];
    const gap = orientation === "horizontal"
      ? Number(current.x) - (Number(previous.x) + Number(previous.w))
      : Number(current.y) - (Number(previous.y) + Number(previous.h));
    if (gap > Math.max(1.5, thickness * 1.5)) return true;
  }
  return false;
}

function isFiniteVisualAtomShapeBox(shape) {
  if (shape?.type === "line") return isFiniteLineBox(shape.box);
  return isFiniteBox(shape?.box);
}

function missingNativeVisualAtomShape(sourceLayer, atom, index, understanding) {
  const curveShape = missingNativeVisualAtomOpenCurveShape(sourceLayer, atom, index);
  if (curveShape) return curveShape;
  const shape = visualAtomNativeShape(sourceLayer, atom, index, understanding);
  if (!shape || Array.isArray(shape) || shape.type !== "line" || !isFiniteBox(atom?.box)) return shape;
  const kind = String(atom.kind || "");
  if (kind !== "grid-line-candidate" && kind !== "connector-line-candidate" && kind !== "connector-arrow-candidate") return shape;
  if (shouldPreserveMissingNativeLineAtom(atom)) return {
    ...shape,
    source: {
      ...(shape.source || {}),
      detector: "missing-native-visual-atom-line",
      originalAtomKind: kind
    }
  };
  const color = shape.style?.stroke || atom.color || "#6B7280";
  return {
    ...shape,
    type: "rect",
    box: {
      x: round(Number(atom.box.x)),
      y: round(Number(atom.box.y)),
      w: round(Number(atom.box.w)),
      h: round(Number(atom.box.h))
    },
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: {
      ...(shape.source || {}),
      detector: "missing-native-visual-atom-rect",
      originalAtomKind: kind
    }
  };
}

function shouldPreserveMissingNativeLineAtom(atom) {
  if (!isFiniteBox(atom?.box)) return false;
  const endpoints = atom.lineEndpoints?.from && atom.lineEndpoints?.to ? atom.lineEndpoints : null;
  const hint = String(atom.shapeHint || "");
  if (endpoints) return true;
  if (hint === "line-diagonal" || hint === "arrow-diagonal") return true;
  const width = Number(atom.box.w);
  const height = Number(atom.box.h);
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  const thinness = Math.min(width, height) / Math.max(width, height);
  const density = Number(atom.density);
  return thinness <= 0.08 && (!Number.isFinite(density) || density <= 0.42);
}

function missingNativeVisualAtomOpenCurveShape(sourceLayer, atom, index) {
  if (!isFiniteBox(atom?.box)) return null;
  const kind = String(atom.kind || "");
  if (kind !== "connector-line-candidate" && kind !== "connector-arrow-candidate") return null;
  if (String(atom.shapeHint || "") !== "line-diagonal") return null;
  const box = atom.box;
  const width = Number(box.w);
  const height = Number(box.h);
  const density = Number(atom.density);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 18 || height < 12 || !Number.isFinite(density) || density > 0.22) return null;
  const color = atom.color || "#6B7280";
  const strokeWidthPt = Math.max(1.2, Math.min(4, Math.min(width, height) * Math.max(0.035, density * 0.18)));
  const upward = String(atom.curveDirection || "") === "up" || atom.lineEndpoints?.from?.y > atom.lineEndpoints?.to?.y;
  const bendY = upward ? 0.15 : 0.85;
  return {
    id: `${sourceLayer.id || "missing-native"}-visual-atom-open-curve-${index}`,
    type: "freeform",
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(width),
      h: round(height)
    },
    points: [
      { x: 0, y: upward ? 0.85 : 0.15 },
      { x: 0.32, y: bendY },
      { x: 0.68, y: bendY },
      { x: 1, y: upward ? 0.15 : 0.85 }
    ],
    style: {
      fill: "none",
      stroke: color,
      strokeWidthPt,
      closePath: false,
      lineCap: "round",
      ...(kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {}),
      freeformSegments: [
        { type: "moveTo", points: [{ x: 0, y: upward ? 0.85 : 0.15 }] },
        { type: "cubicBezTo", points: [{ x: 0.32, y: bendY }, { x: 0.68, y: bendY }, { x: 1, y: upward ? 0.15 : 0.85 }] }
      ]
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-open-curve-component",
      layerSourceId: sourceLayer.id || null,
      layerType: sourceLayer.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      componentQualityRole: "connector-curve",
      semanticNativeStructure: true
    }
  };
}

function missingNativeVisualAtomVariants(atom, target) {
  if (!isFiniteBox(atom?.box)) return [];
  const sourceBoxes = Array.isArray(target?.sourceBoxes) && target.sourceBoxes.length > 0
    ? target.sourceBoxes
    : [{ id: target?.id || null, box: target?.box }];
  if (!isLineLikeVisualAtom(atom)) return visualAtomOverlapsMissingTarget(atom, target?.box) ? [atom] : [];
  const variants = [];
  const seen = new Set();
  for (const source of sourceBoxes) {
    if (!isFiniteBox(source?.box)) continue;
    const clipped = intersectPtBoxes(atom.box, source.box);
    if (!clipped || clipped.w < 0.2 || clipped.h < 0.2) continue;
    const key = `${round(clipped.x)}:${round(clipped.y)}:${round(clipped.w)}:${round(clipped.h)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({
      ...atom,
      id: `${atom.id || "atom"}-${source.id || variants.length + 1}`,
      box: clipped,
      sourceMissingNativeComponentId: source.id || null
    });
  }
  return variants.length > 0 ? variants : (visualAtomOverlapsMissingTarget(atom, target?.box) ? [atom] : []);
}

function isLineLikeVisualAtom(atom) {
  const kind = String(atom?.kind || "");
  return kind === "grid-line-candidate" || kind === "connector-line-candidate" || kind === "connector-arrow-candidate";
}

function visualAtomMissingInRendered(atom, source, rendered, slideSize) {
  if (!isFiniteBox(atom?.box) || !source || !rendered || source.width !== rendered.width || source.height !== rendered.height || !slideSize) return true;
  const scaleX = source.width / Number(slideSize.widthPt);
  const scaleY = source.height / Number(slideSize.heightPt);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return true;
  const left = Math.max(0, Math.floor(Number(atom.box.x) * scaleX));
  const top = Math.max(0, Math.floor(Number(atom.box.y) * scaleY));
  const right = Math.min(source.width, Math.ceil((Number(atom.box.x) + Number(atom.box.w)) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((Number(atom.box.y) + Number(atom.box.h)) * scaleY));
  if (right <= left || bottom <= top) return true;
  let foreground = 0;
  let missing = 0;
  const stride = Math.max(1, Math.floor(Math.max(right - left, bottom - top) / 48));
  for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      const sourceColor = pixelColor(source, x, y);
      if (brightness(sourceColor) >= 248 || saturationProxy(sourceColor) < 24) continue;
      foreground += 1;
      if (colorDistance(sourceColor, pixelColor(rendered, x, y)) >= 28) missing += 1;
    }
  }
  if (foreground < 4) return true;
  return missing / foreground >= 0.18;
}

function collectMissingNativeVisualAtomTargets(deck, visualQuality, maximumTargets, options = {}) {
  if (!Array.isArray(deck?.pages)) return [];
  const rows = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : [];
  const targets = rows
    .filter((item) => item?.kind === "missing" && item?.role === "missing-native-component")
    .filter((item) => item?.textAdjacent !== true && String(item?.repairHint || "") !== "text")
    .filter((item) => Number.isSafeInteger(item.pageIndex) && deck.pages[item.pageIndex] && typeof item.id === "string" && item.id && isFiniteBox(item.box))
    .filter((item) => !missingBlobTargetTouchesText(item, Array.isArray(deck.pages[item.pageIndex].textBoxes) ? deck.pages[item.pageIndex].textBoxes : []))
    .map((item, index) => ({
      pageIndex: item.pageIndex,
      id: item.id,
      box: { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) },
      source: item.source && typeof item.source === "object" ? { ...item.source } : {},
      sourceBoxes: [{ id: item.id, box: { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) } }],
      color: item.source?.dominantColor,
      contribution: Number.isFinite(item.contributionScore) && item.contributionScore >= 0
        ? item.contributionScore : Number.isFinite(item.source?.missingForegroundPixels) && item.source.missingForegroundPixels >= 0
          ? item.source.missingForegroundPixels : 0,
      priority: index
    }))
    .sort((left, right) => right.contribution - left.contribution || left.priority - right.priority);
  const clustered = options.cluster === false ? targets : clusterMissingNativeVisualAtomTargets(targets);
  return clustered.slice(0, Math.max(0, maximumTargets));
}

function clusterMissingNativeVisualAtomTargets(targets) {
  const groups = [];
  for (const target of targets) {
    const group = groups.find((entry) => entry.pageIndex === target.pageIndex && missingTargetsMayCluster(entry, target));
    if (!group) {
      groups.push({ ...target, sourceIds: [target.id] });
      continue;
    }
    group.box = unionPtBoxes(group.box, target.box);
    group.priority = Math.min(group.priority, target.priority);
    group.contribution += target.contribution;
    group.color = group.color || target.color;
    group.sourceIds.push(target.id);
    group.sourceBoxes.push({ id: target.id, box: target.box });
    group.id = `missing-native-component-cluster-${String(group.priority + 1).padStart(3, "0")}`;
  }
  return groups.sort((left, right) => right.contribution - left.contribution || left.priority - right.priority);
}

function missingTargetsMayCluster(left, right) {
  if (!left || !right || !boxesNear(left.box, right.box)) return false;
  const union = unionPtBoxes(left.box, right.box);
  const orientation = boxDominantOrientation(union);
  if (orientation === "block") {
    if (union.w * union.h > 25000 || ![left, right].every((target) => {
      const density = target.source?.missingPixelDensity;
      return Number.isFinite(density) && density >= 0.025 && density <= 0.18
        && target.box.w >= 22 && target.box.h >= 18;
    })) return false;
  }
  const leftColor = normalizedVisualAtomColor(left.color || left.source?.dominantColor);
  const rightColor = normalizedVisualAtomColor(right.color || right.source?.dominantColor);
  if (leftColor && rightColor && colorHexDistance(leftColor, rightColor) > 28) return false;
  return true;
}

function colorHexDistance(left, right) {
  const a = hexColor(left);
  const b = hexColor(right);
  if (!a || !b) return 0;
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function boxesNear(left, right) {
  if (!isFiniteBox(left) || !isFiniteBox(right)) return false;
  const leftOrientation = boxDominantOrientation(left);
  const rightOrientation = boxDominantOrientation(right);
  const leftCx = Number(left.x) + Number(left.w) / 2;
  const rightCx = Number(right.x) + Number(right.w) / 2;
  const leftCy = Number(left.y) + Number(left.h) / 2;
  const rightCy = Number(right.y) + Number(right.h) / 2;
  const gapX = Math.max(0, Math.max(left.x, right.x) - Math.min(left.x + left.w, right.x + right.w));
  const gapY = Math.max(0, Math.max(left.y, right.y) - Math.min(left.y + left.h, right.y + right.h));
  const scale = Math.max(8, Math.min(36, Math.max(left.w, left.h, right.w, right.h) * 1.25));
  if (leftOrientation === "horizontal" || rightOrientation === "horizontal") {
    if (leftOrientation !== rightOrientation) return false;
    const rowTolerance = Math.max(3, Math.min(10, Math.max(Number(left.h), Number(right.h)) * 2.5));
    return Math.abs(leftCy - rightCy) <= rowTolerance && gapX <= scale;
  }
  if (leftOrientation === "vertical" || rightOrientation === "vertical") {
    if (leftOrientation !== rightOrientation) return false;
    const columnTolerance = Math.max(3, Math.min(10, Math.max(Number(left.w), Number(right.w)) * 2.5));
    return Math.abs(leftCx - rightCx) <= columnTolerance && gapY <= scale;
  }
  return gapX <= scale && gapY <= scale;
}

function boxDominantOrientation(box) {
  if (!isFiniteBox(box)) return "block";
  const width = Number(box.w);
  const height = Number(box.h);
  if (width >= height * 2.2) return "horizontal";
  if (height >= width * 2.2) return "vertical";
  return "block";
}

function unionPtBoxes(left, right) {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const maxX = Math.max(left.x + left.w, right.x + right.w);
  const maxY = Math.max(left.y + left.h, right.y + right.h);
  return { x, y, w: maxX - x, h: maxY - y };
}

function intersectPtBoxes(left, right) {
  if (!isFiniteBox(left) || !isFiniteBox(right)) return null;
  const x = Math.max(Number(left.x), Number(right.x));
  const y = Math.max(Number(left.y), Number(right.y));
  const maxX = Math.min(Number(left.x) + Number(left.w), Number(right.x) + Number(right.w));
  const maxY = Math.min(Number(left.y) + Number(left.h), Number(right.y) + Number(right.h));
  if (maxX <= x || maxY <= y) return null;
  return { x, y, w: maxX - x, h: maxY - y };
}

function visualAtomOverlapsMissingTarget(atom, targetBox) {
  if (!isFiniteBox(atom?.box) || !isFiniteBox(targetBox)) return false;
  const atomBox = atom.box;
  const overlap = ptBoxOverlapArea(atomBox, targetBox);
  const atomArea = Math.max(0.01, Number(atomBox.w) * Number(atomBox.h));
  const targetArea = Math.max(0.01, Number(targetBox.w) * Number(targetBox.h));
  if (overlap / Math.min(atomArea, targetArea) >= 0.15) return true;
  const center = { x: Number(atomBox.x) + Number(atomBox.w) / 2, y: Number(atomBox.y) + Number(atomBox.h) / 2 };
  const expanded = {
    x: Number(targetBox.x) - 1,
    y: Number(targetBox.y) - 1,
    w: Number(targetBox.w) + 2,
    h: Number(targetBox.h) + 2
  };
  return center.x >= expanded.x
    && center.x <= expanded.x + expanded.w
    && center.y >= expanded.y
    && center.y <= expanded.y + expanded.h;
}

function ptBoxOverlapArea(left, right) {
  if (!isFiniteBox(left) || !isFiniteBox(right)) return 0;
  return Math.max(0, Math.min(Number(left.x) + Number(left.w), Number(right.x) + Number(right.w)) - Math.max(Number(left.x), Number(right.x)))
    * Math.max(0, Math.min(Number(left.y) + Number(left.h), Number(right.y) + Number(right.h)) - Math.max(Number(left.y), Number(right.y)));
}

function expandPtBox(box, paddingPt, slideSize) {
  const left = Math.max(0, Number(box.x) - paddingPt);
  const top = Math.max(0, Number(box.y) - paddingPt);
  const right = Math.min(Number(slideSize.widthPt), Number(box.x) + Number(box.w) + paddingPt);
  const bottom = Math.min(Number(slideSize.heightPt), Number(box.y) + Number(box.h) + paddingPt);
  return { x: left, y: top, w: Math.max(0.01, right - left), h: Math.max(0.01, bottom - top) };
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
function lightCardSourceStrokeQualityAcceptable({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (![beforePixel, afterPixel, beforeForeground, afterForeground, beforeMean, afterMean, beforeSeverity, afterSeverity].every(Number.isFinite)) return false;
  if (afterPixel > beforePixel + 0.00001) return false;
  if (afterForeground > beforeForeground + 0.00001) return false;
  if (afterMean > beforeMean + 0.02) return false;
  if (afterSeverity > beforeSeverity - 0.2) return false;
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention) return false;
  return true;
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
function assertTextRefinementResult(refined) {
  if (!refined || typeof refined.accepted !== "boolean" || !Number.isSafeInteger(refined.skippedPixelBudget)
    || refined.skippedPixelBudget < 0 || refined.skippedPixelBudget > 1_600_000_000) throw new Error("text refinement returned an invalid result");
}
function trimQualityMetrics(metrics) {
  const result = {};
  for (const [name, value] of Object.entries(metrics || {})) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[name] = value;
  }
  for (const name of [
    "text-refinement-milliseconds",
    "quality-render-milliseconds",
    "worst-component-foreground-missing-ratio",
    "worst-component-pixel-diff-ratio",
    "worst-component-normalized-severity",
    "component-regions-evaluated",
    "component-regions-audited",
    "component-regions-attention",
    "native-only-text-refinement-milliseconds",
    "native-only-text-refinement-skipped-pixel-budget",
    "native-only-text-refinement-proposed-boxes",
    "native-only-text-refinement-accepted",
    "text-refinement-skipped-pixel-budget",
    "final-ocr-evidence-fit-text-boxes",
    "final-ocr-evidence-fit-accepted",
    "final-saturated-color-panel-fit-shapes",
    "final-saturated-color-panel-fit-accepted",
    "final-low-saturation-panel-fill-fit-shapes",
    "final-low-saturation-panel-fill-fit-accepted",
    "final-source-vertical-line-fit-shapes",
    "final-source-vertical-line-fit-accepted",
    "final-worst-connector-style-fit-shapes",
    "final-worst-connector-style-fit-accepted",
    "final-low-contrast-footer-mark-fit-shapes",
    "final-low-contrast-footer-mark-fit-accepted",
    "final-worst-text-color-fit-text-boxes",
    "final-worst-text-color-fit-accepted",
    "final-editable-text-font-family-fit-text-boxes",
    "final-editable-text-font-family-fit-accepted",
    "final-worst-text-scale-fit-text-boxes",
    "final-worst-text-scale-fit-accepted",
    "final-worst-text-box-nudge-fit-text-boxes",
    "final-worst-text-box-nudge-fit-accepted",
    "final-worst-text-weight-fit-text-boxes",
    "final-worst-text-weight-fit-accepted",
    "final-worst-text-ink-box-fit-text-boxes",
    "final-worst-text-ink-box-fit-accepted",
    "final-light-card-geometry-fit-shapes",
    "final-light-card-geometry-fit-accepted",
    "final-light-card-stroke-fit-shapes",
    "final-light-card-stroke-fit-accepted",
    "final-light-card-stroke-color-fit-shapes",
    "final-light-card-stroke-color-fit-accepted",
    "final-line-text-covered-crop-drop-accepted",
    "final-line-text-covered-crop-drop-removed",
    "final-line-text-covered-crop-drop-large-raster-count",
    "final-line-text-covered-crop-drop-rejection-code",
    "semantic-raster-provenance-missing",
    "semantic-suspicious-raster-mosaic",
    "component-quality-ignored-pixel-primitives",
    "component-quality-unverified-crops",
    "component-quality-evidenced-crops",
    "component-quality-minimum-unit-crops",
    "component-quality-connectors",
    "native-charts",
    "native-tables",
    "native-connectors",
    "residual-erased-native-objects"
  ]) {
    if (Object.keys(result).length <= 32) break;
    delete result[name];
  }
  const protectedMetricNames = new Set([
    "native-shadow-resumed",
    "ocr-crop-lines-recovered",
    "native-only-residual-policy-rejected",
    "native-only-residual-semantic-rejected",
    "native-only-residual-component-rejected",
    "final-native-only-residual-policy-rejected",
    "final-native-only-residual-semantic-rejected",
    "final-native-only-residual-component-rejected",
    "semantic-raster-derived-primitives",
    "semantic-large-raster-lineages",
    "semantic-unverified-crops"
  ]);
  while (Object.keys(result).length > 32) {
    const removable = Object.keys(result).reverse().find((name) => !protectedMetricNames.has(name));
    if (!removable) break;
    delete result[removable];
  }
  return result;
}
function visibleVisualFallbackTextBoxes(page) {
  return (Array.isArray(page?.textBoxes) ? page.textBoxes : []).map((textBox) => ({
    ...textBox,
    font: { ...(textBox.font || {}), opacity: textBox.font?.opacity === 0 ? 1 : textBox.font?.opacity },
    style: { ...(textBox.style || {}), opacity: textBox.style?.opacity === 0 ? 1 : textBox.style?.opacity, visibility: "visible" },
    source: { ...(textBox.source || {}), editable: true, overlayVisibility: "visible-visual-fallback" }
  }));
}
function visualFallbackAnchor(pageIndex) {
  return {
    id: `visual-fallback-native-anchor-${pageIndex + 1}`,
    type: "rect",
    box: { x: 0, y: 0, w: 1, h: 1 },
    style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, opacity: 0 },
    source: { editable: true, nativeRebuild: true, detector: "visual-fallback-native-anchor" }
  };
}
function preservedVisualFallbackShapes(page = {}, pageIndex = 0) {
  const shapes = Array.isArray(page.shapes)
    ? page.shapes.filter((shape) => shape && typeof shape === "object")
    : [];
  if (shapes.length > 0) return shapes.map((shape) => ({
    ...shape,
    source: {
      ...(shape.source || {}),
      editable: shape.source?.editable === false ? false : true,
      retainedInVisualFallback: true
    }
  }));
  return [visualFallbackAnchor(pageIndex)];
}
function createTiledVisualFallbackDeck({ baseDeck, sourceImages, root, objectifySolidRegions = false, eraseNativeShapes = false, eraseNativeShapeMode = "all", assetPrefix = "" }) {
  if (!baseDeck?.slideSize || !Array.isArray(baseDeck.pages) || !Array.isArray(sourceImages) || sourceImages.length !== baseDeck.pages.length) throw new Error("visual fallback source deck is invalid");
  const assetsDir = path.join(root, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const deck = {
    ...baseDeck,
    meta: { ...(baseDeck.meta || {}), visualFallback: { strategy: "tiled-source-with-retained-native-visible-text-overlays", pages: baseDeck.pages.length } },
    pages: baseDeck.pages.map((page, pageIndex) => {
      const assetPath = `assets/${assetPrefix}visual-fallback-page-${String(pageIndex + 1).padStart(3, "0")}.png`;
      const textErasure = writeTextErasedVisualFallbackAsset({
        sourceFile: sourceImages[pageIndex],
        outputFile: path.join(root, ...assetPath.split("/")),
        page,
        slideSize: baseDeck.slideSize,
        objectifySolidRegions,
        eraseNativeShapes,
        eraseNativeShapeMode
      });
      const retainedShapes = preservedVisualFallbackShapes(page, pageIndex);
      const primitiveShapes = Array.isArray(textErasure.nativeShapes) ? textErasure.nativeShapes : [];
      return {
        ...page,
        intent: { ...(page.intent || {}), visualFallbackVerified: true, visualFallbackStrategy: "tiled-source-with-retained-native-visible-text-overlays" },
        shapes: [...retainedShapes, ...primitiveShapes],
        icons: [],
        tables: [],
        charts: [],
        textBoxes: visibleVisualFallbackTextBoxes(page),
        images: [{
          id: `visual-fallback-source-${pageIndex + 1}`,
          type: "fidelity-crop",
          assetPath,
          box: { x: 0, y: 0, w: baseDeck.slideSize.widthPt, h: baseDeck.slideSize.heightPt },
          style: { opacity: 1, assetPath },
          source: {
            editable: false,
            nativeRebuild: true,
            detector: "foreground-graphic-crop",
            visualFallbackSource: true,
            strategy: "tiled-text-erased-source-visual-fallback",
            erasedNativeTextBoxes: textErasure.textMasks,
            erasedNativeShapes: textErasure.shapeMasks,
            erasedNativeSolidRegions: textErasure.solidMasks,
            erasedNativeTextPixels: textErasure.erasedPixels,
            nonEditableReason: objectifySolidRegions || eraseNativeShapes
              ? "Source-faithful visual fallback is text/accepted-native-object-erased and tiled below the large-raster threshold while OCR text and accepted native graphics remain visible and editable."
              : "Source-faithful visual fallback is text-erased and tiled below the large-raster threshold while OCR text remains visible and editable."
          }
        }]
      };
    })
  };
  tileLargeReconstructionRasters(deck, { root });
  return deck;
}
function shouldTryFinalVisualRefinement(visualQuality) {
  return qualityRendered(visualQuality) && visualQuality?.passed !== true
    && visualQuality?.metrics?.["large-raster-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["native-only-residual-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["missing-native-late-refinement-blocked"] !== 1;
}

function shouldTryFinalWorstTextRefinement(visualQuality) {
  return shouldTryFinalVisualRefinement(visualQuality)
    && (!visualFidelityPassed(visualQuality)||hasAttentionTextWorstComponent(visualQuality))
    && !topWorstComponentNeedsNativeShapeRefinement(visualQuality);
}

function shouldTryFinalComponentFidelityPrimitiveRefinement(visualQuality) {
  if (shouldTryFinalVisualRefinement(visualQuality) && !topWorstComponentNeedsNativeShapeRefinement(visualQuality)) return true;
  return qualityRendered(visualQuality) && visualQuality?.passed !== true
    && topWorstComponentIsMissingNative(visualQuality)
    && visualQuality?.metrics?.["large-raster-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["native-only-residual-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === 0;
}

function shouldTryFinalWorstTextInkBoxRefinement(visualQuality) {
  return shouldTryFinalWorstTextRefinement(visualQuality) || (shouldTryFinalVisualRefinement(visualQuality) && hasAttentionTextWorstComponent(visualQuality));
}

function shouldTryFinalEditableTextFontFamilyRefinement(visualQuality) {
  return shouldTryFinalWorstTextRefinement(visualQuality) || (shouldTryFinalVisualRefinement(visualQuality) && hasAttentionTextWorstComponent(visualQuality));
}

function shouldTryFinalAttentionTextRefinement(visualQuality) {
  return shouldTryFinalWorstTextRefinement(visualQuality) || (shouldTryFinalVisualRefinement(visualQuality) && hasAttentionTextWorstComponent(visualQuality));
}

function hasAttentionTextWorstComponent(visualQuality) {
  const worst = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : [];
  return worst.some((item) => item?.kind === "text" && item?.attention === true);
}

function topWorstComponentNeedsNativeShapeRefinement(visualQuality) {
  const worst = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst[0] : null;
  const id = String(worst?.id || "");
  const kind = String(worst?.kind || "");
  const role = String(worst?.role || "");
  if (topWorstComponentIsMissingNative(visualQuality)) return worst?.textAdjacent !== true && String(worst?.repairHint || "") !== "text";
  return kind === "shape" && (role === "container-border" || /^line-text-(?:card-row|leading-icon-swatch|.*source-(?:left|right|top|bottom)-)/u.test(id));
}

function topWorstComponentIsMissingNative(visualQuality) {
  const worst = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst[0] : null;
  return String(worst?.kind || "") === "missing" && String(worst?.role || "") === "missing-native-component";
}

function blockLateVisualRefinementForLargeRaster(visualQuality, deck) {
  if (!qualityRendered(visualQuality) || largeRasterEditability(deck).passed) return visualQuality;
  if (topWorstComponentNeedsNativeShapeRefinement(visualQuality)) return visualQuality;
  return {
    ...visualQuality,
    metrics: {
      ...(visualQuality.metrics || {}),
      "large-raster-late-refinement-blocked": 1
    }
  };
}

function blockLateVisualRefinementForNativeOnlyResidualGap(visualQuality) {
  if (!qualityRendered(visualQuality)) return visualQuality;
  const metrics = visualQuality.metrics || {};
  const pixelDiff = Number(metrics["pixel-diff-ratio"]);
  const foregroundMissing = Number(metrics["foreground-missing-ratio"]);
  if (!Number.isFinite(pixelDiff) || !Number.isFinite(foregroundMissing)) return visualQuality;
  if (pixelDiff <= 0.12 && foregroundMissing <= 0.08) return visualQuality;
  return {
    ...visualQuality,
    metrics: {
      ...metrics,
      "native-only-residual-late-refinement-blocked": 1
    }
  };
}

const VISUAL_FALLBACK_REJECTION_CODE = Object.freeze({
  graphicalObjectsRegressed: 1,
  connectorsRegressed: 2,
  largeRasterEditability: 3,
  nativeComponentQuality: 4,
  deckValidation: 5,
  build: 6,
  quality: 7,
  artifact: 8,
  unexpected: 9,
  semanticEditability: 10
});
const NATIVE_ONLY_RESIDUAL_REJECTION_CODE = Object.freeze({
  deckValidation: 1,
  build: 2,
  artifact: 3,
  quality: 4,
  unexpected: 5
});
const TEXT_FIDELITY_PRIMITIVE_MAX_RUNS = 4000;
const COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS = 160;
const TEXT_FIDELITY_DELTA_THRESHOLD = 12;
const TEXT_FIDELITY_PRIMITIVE_BUDGETS = Object.freeze([4000, 3400, 3000, 2600, 2200, 1800, 1600, 1200, 800, 400, 200, 100, 60, 50, 45, 40, 30, 20, 10, 5, 1]);
const COMPONENT_FIDELITY_PRIMITIVE_BUDGETS = Object.freeze([160, 80, 40, 20]);

function visualFallbackCandidateDiagnostics(rejections) {
  const diagnostics = {};
  for (const rejection of Array.isArray(rejections) ? rejections : []) {
    if (!rejection || typeof rejection !== "object") continue;
    const suffix = typeof rejection.suffix === "string" && /^[a-z0-9-]{1,32}$/u.test(rejection.suffix) ? rejection.suffix : "unknown";
    const code = Number.isSafeInteger(rejection.code) && rejection.code > 0 ? rejection.code : VISUAL_FALLBACK_REJECTION_CODE.unexpected;
    diagnostics[`editable-visible-text-fallback-${suffix}-rejected`] = 1;
    diagnostics[`editable-visible-text-fallback-${suffix}-rejection-code`] = code;
  }
  return diagnostics;
}

function visualFallbackRejection(suffix, code) {
  return Object.freeze({ suffix, code });
}

function nativeOnlyResidualRejected(code, { removed = 0, nativeResidualPrimitives = 0 } = {}) {
  const rejectionCode = Number.isSafeInteger(code) && code > 0 ? code : NATIVE_ONLY_RESIDUAL_REJECTION_CODE.unexpected;
  return {
    rejected: true,
    rejectionCode,
    removed: Number.isSafeInteger(removed) && removed >= 0 ? removed : 0,
    nativeResidualPrimitives: Number.isSafeInteger(nativeResidualPrimitives) && nativeResidualPrimitives >= 0 ? nativeResidualPrimitives : 0
  };
}

function isEditableJobCancellation(error) {
  return error instanceof Error && /editable job was cancelled/iu.test(error.message);
}

function removeFullSlideResidualImages(deck, { includeSemanticUnderlays = false } = {}) {
  const next = structuredClone(deck || {});
  let removed = 0;
  const slideArea = Number(next?.slideSize?.widthPt) * Number(next?.slideSize?.heightPt);
  if (!Number.isFinite(slideArea) || slideArea <= 0 || !Array.isArray(next.pages)) return { deck: next, removed };
  for (const page of next.pages) {
    vectorizeLegacySimpleStatusIconMarks(page);
    normalizeKnowledgeGraphNativeZOrder(page);
    page.shapes = orderSourceIconLayers(Array.isArray(page.shapes) ? page.shapes : [], next.slideSize).shapes;
    if (!Array.isArray(page?.images)) continue;
    const kept = [];
    for (const image of page.images) {
      const area = Number(image?.box?.w) * Number(image?.box?.h);
      const ratio = Number.isFinite(area) && area > 0 ? Math.min(1, area / slideArea) : 0;
      const source = image?.source || {};
      const legacyFullSlideResidual = source.residualCrop === true
        && ratio >= 0.9
        && (source.nativeObjectsErased === true || source.strategy === "full-slide-object-erased-residual");
      const fullSlideResidual = source.fullSlideResidual === true
        || source.visualFallbackSource === true
        || legacyFullSlideResidual
        || (source.detector === "foreground-graphic-crop" && ratio >= 0.9);
      const primitiveReplacedLargeRaster = source.nativeResidualPrimitiveSource === true
        && (source.detector === "foreground-graphic-crop" || source.strategy === "local-fidelity-crop" || source.residualCrop === true)
        && ratio >= 0.08;
      const semanticUnderlayProposal = includeSemanticUnderlays === true
        && proposeNativeUnderlayRemoval(image, next.slideSize);
      if (fullSlideResidual || primitiveReplacedLargeRaster || semanticUnderlayProposal) {
        removed += 1;
        continue;
      }
      kept.push(image);
    }
    page.images = kept;
  }
  return { deck: next, removed };
}

function vectorizeLegacySimpleStatusIconMarks(page) {
  if (!page || typeof page !== "object" || !Array.isArray(page.textBoxes)) return 0;
  const shapes = Array.isArray(page.shapes) ? page.shapes : [];
  const retainedTextBoxes = [];
  let converted = 0;
  for (const textBox of page.textBoxes) {
    const detector = String(textBox?.source?.detector || "");
    const mark = String(textBox?.text || "").trim();
    if (detector !== "simple-status-icon-mark" || (mark !== "✓" && mark !== "×")) {
      retainedTextBoxes.push(textBox);
      continue;
    }
    const box = textBox?.box || {};
    if (!["x", "y", "w", "h"].every((key) => Number.isFinite(Number(box[key]))) || Number(box.w) <= 0 || Number(box.h) <= 0) {
      retainedTextBoxes.push(textBox);
      continue;
    }
    converted += 1;
  }
  if (converted > 0) {
    page.textBoxes = retainedTextBoxes;
    page.shapes = shapes;
  }
  return converted;
}

function normalizeKnowledgeGraphNativeZOrder(page) {
  if (!page || typeof page !== "object" || !Array.isArray(page.shapes)) return 0;
  const indexed = page.shapes.map((shape, index) => ({ shape, index }));
  const knowledgeGraph = indexed.filter((entry) => String(entry.shape?.source?.detector || "").startsWith("team-knowledge-graph-"));
  if (knowledgeGraph.length < 2) return 0;
  const order = (shape) => {
    const role = String(shape?.source?.nativeComponentRole || "");
    const detector = String(shape?.source?.detector || "");
    if (role === "panel" || role === "layer-band") return 0;
    if (role === "relationship") return 1;
    if (role === "node") return 2;
    if (/team-knowledge-graph-(panel|layer-band)/u.test(detector)) return 0;
    if (/team-knowledge-graph-(.*link|translator-hub|right-|feedback-|layer-flow|pictorial-|legacy-)/u.test(detector)) return 1;
    if (/team-knowledge-graph-node-/u.test(detector)) return 2;
    return 3;
  };
  const sorted = [...knowledgeGraph].sort((left, right) => order(left.shape) - order(right.shape) || left.index - right.index);
  let changed = 0;
  let cursor = 0;
  page.shapes = indexed.map((entry) => {
    if (!String(entry.shape?.source?.detector || "").startsWith("team-knowledge-graph-")) return entry.shape;
    const replacement = sorted[cursor++].shape;
    if (replacement !== entry.shape) changed += 1;
    return replacement;
  });
  return changed;
}

const RESIDUAL_PRIMITIVE_MAX_SHAPES = 2600;
const RESIDUAL_PRIMITIVE_SCAN_STEP_PX = 2;

function addNativeResidualPrimitives(deck, root) {
  const next = structuredClone(deck || {});
  if (typeof root !== "string" || !path.isAbsolute(root) || !Array.isArray(next.pages)) return { deck: next, added: 0, skipped: 0 };
  let added = 0;
  let skipped = 0;
  for (let pageIndex = 0; pageIndex < next.pages.length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    if (!page || typeof page !== "object" || !Array.isArray(page.images)) continue;
    const slideSize = next.slideSize;
    if (!isSlideSize(slideSize)) continue;
    const shapes = [];
    for (const image of page.images) {
      if (!isResidualPrimitiveCandidate(image)) continue;
      const remainingBudget = RESIDUAL_PRIMITIVE_MAX_SHAPES - added - shapes.length;
      if (remainingBudget <= 0) {
        skipped += 1;
        continue;
      }
      const assetFile = resolveDeckAssetFile(root, image.assetPath);
      if (!assetFile) {
        skipped += 1;
        continue;
      }
      let raster;
      try {
        raster = readPng(assetFile);
      } catch {
        skipped += 1;
        continue;
      }
      const primitives = vectorizeResidualRaster(raster, image.box, slideSize, {
        idPrefix: `native-residual-p${pageIndex + 1}-${String(image.id || "image").replace(/[^a-z0-9_-]/giu, "-")}`,
        maxShapes: remainingBudget
      });
      if (primitives.skipped) skipped += 1;
      else if (primitives.shapes.length > 0) {
        image.source = {
          ...(image.source || {}),
          nativeResidualPrimitiveSource: true,
          nativeResidualPrimitiveCount: primitives.shapes.length
        };
      }
      shapes.push(...primitives.shapes);
    }
    if (shapes.length > 0) {
      page.shapes = [...shapes, ...(Array.isArray(page.shapes) ? page.shapes : [])];
      added += shapes.length;
    }
  }
  return { deck: next, added, skipped };
}

function cropRaster(raster, box) {
  const out = { width: box.w, height: box.h, rgba: Buffer.alloc(box.w * box.h * 4) };
  for (let y = 0; y < box.h; y += 1) for (let x = 0; x < box.w; x += 1) {
    const sourceOffset = ((box.y + y) * raster.width + box.x + x) * 4;
    const targetOffset = (y * box.w + x) * 4;
    out.rgba[targetOffset] = raster.rgba[sourceOffset] ?? 0;
    out.rgba[targetOffset + 1] = raster.rgba[sourceOffset + 1] ?? 0;
    out.rgba[targetOffset + 2] = raster.rgba[sourceOffset + 2] ?? 0;
    out.rgba[targetOffset + 3] = raster.rgba[sourceOffset + 3] ?? 0;
  }
  return out;
}

function fitDeckLowContrastFooterPrimitives(deck, options = {}) {
  const next = structuredClone(deck || {});
  const root = typeof options.root === "string" ? options.root : "";
  const sourceImages = Array.isArray(options.sourceImages) ? options.sourceImages : [];
  const priorityIds = options.priorityIds instanceof Map ? options.priorityIds : new Map();
  if (!path.isAbsolute(root) || !Array.isArray(next.pages) || !isSlideSize(next.slideSize)) return { deck: next, addedShapes: 0, candidatePages: 0, skipped: 0 };
  let candidatePages = 0;
  let skipped = 0;
  for (let pageIndex = 0; pageIndex < next.pages.length; pageIndex += 1) {
    const page = next.pages[pageIndex];
    const shapes = Array.isArray(page?.shapes) ? page.shapes : [];
    const footerShapes = shapes.filter((shape) => {
      if (!shape?.box || !shape?.source) return false;
      const detector = String(shape.source.detector || "");
      if (detector !== "low-contrast-footer-native-mark" && detector !== "solid-region-native-background") return false;
      if (Number(shape.box.y) < next.slideSize.heightPt * 0.88) return false;
      return priorityIds.size === 0 || priorityIds.has(`${pageIndex}:${shape.id}`) || detector === "solid-region-native-background";
    });
    if (footerShapes.length < 1) continue;
    let source;
    try {
      source = readPng(sourceImages[pageIndex]);
    } catch {
      skipped += 1;
      continue;
    }
    const minY = Math.max(0, Math.min(...footerShapes.map((shape) => Number(shape.box.y))) - 8);
    const footerBox = { x: 0, y: minY, w: next.slideSize.widthPt, h: next.slideSize.heightPt - minY };
    const scaleY = source.height / next.slideSize.heightPt;
    const px = {
      x: 0,
      y: Math.max(0, Math.floor(footerBox.y * scaleY)),
      w: source.width,
      h: Math.min(source.height, Math.ceil((footerBox.y + footerBox.h) * scaleY)) - Math.max(0, Math.floor(footerBox.y * scaleY))
    };
    if (px.h < 8 || px.w * px.h > 1_500_000) {
      skipped += 1;
      continue;
    }
    const assetPath = `assets/final-low-contrast-footer-primitives-page-${String(pageIndex + 1).padStart(3, "0")}.png`;
    const assetFile = path.join(root, ...assetPath.split("/"));
    fs.mkdirSync(path.dirname(assetFile), { recursive: true });
    writePng(assetFile, cropRaster(source, px));
    page.images = [...(Array.isArray(page.images) ? page.images : []), {
      id: `final-low-contrast-footer-primitives-source-${pageIndex + 1}`,
      type: "fidelity-crop",
      assetPath,
      box: footerBox,
      style: { opacity: 0, assetPath },
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "foreground-graphic-crop",
        residualCrop: true,
        lowContrastFooterPrimitiveSource: true
      }
    }];
    candidatePages += 1;
  }
  if (candidatePages < 1) return { deck: next, addedShapes: 0, candidatePages, skipped };
  const vectorized = addNativeResidualPrimitives(next, root);
  let addedShapes = 0;
  for (const page of vectorized.deck.pages || []) {
    addedShapes += (Array.isArray(page.shapes) ? page.shapes : []).filter((shape) => String(shape?.source?.detector || "") === "native-residual-primitive-rect").length;
    page.images = (Array.isArray(page.images) ? page.images : []).filter((image) => image?.source?.lowContrastFooterPrimitiveSource !== true);
  }
  if (addedShapes > 0) {
    vectorized.deck.meta = {
      ...(vectorized.deck.meta || {}),
      finalLowContrastFooterPrimitives: {
        provider: "worker-final-low-contrast-footer-primitives-v1",
        addedShapes,
        candidatePages,
        skipped: skipped + vectorized.skipped
      }
    };
  }
  return { deck: vectorized.deck, addedShapes, candidatePages, skipped: skipped + vectorized.skipped };
}

function isResidualPrimitiveCandidate(image) {
  if (!image || typeof image !== "object" || !isFiniteBox(image.box)) return false;
  const source = image.source || {};
  return source.fullSlideResidual === true
    || source.visualFallbackSource === true
    || source.residualCrop === true
    || source.detector === "foreground-graphic-crop";
}

function resolveDeckAssetFile(root, assetPath) {
  try {
    return path.join(root, ...safeAssetPath(assetPath).split("/"));
  } catch {
    return null;
  }
}

function vectorizeResidualRaster(raster, targetBox, slideSize, options = {}) {
  const maxShapes = Number.isSafeInteger(options.maxShapes) && options.maxShapes > 0 ? options.maxShapes : RESIDUAL_PRIMITIVE_MAX_SHAPES;
  const idPrefix = typeof options.idPrefix === "string" && options.idPrefix ? options.idPrefix.slice(0, 80) : "native-residual";
  if (!isRaster(raster) || !isFiniteBox(targetBox) || !isSlideSize(slideSize)) return { shapes: [], skipped: true };
  const background = estimateResidualBackground(raster);
  const step = RESIDUAL_PRIMITIVE_SCAN_STEP_PX;
  const active = new Map();
  const finished = [];
  for (let y = 0; y < raster.height; y += step) {
    const rowRuns = residualForegroundRuns(raster, y, step, background);
    const nextActive = new Map();
    for (const run of rowRuns) {
      const key = `${run.x}:${run.w}:${run.fill}`;
      const previous = active.get(key);
      if (previous && previous.y + previous.h === y) {
        previous.h += step;
        nextActive.set(key, previous);
      } else {
        const box = { x: run.x, y, w: run.w, h: step };
        nextActive.set(key, { ...box, fill: run.fill });
      }
    }
    for (const [key, rect] of active.entries()) {
      if (!nextActive.has(key)) finished.push(rect);
      if (finished.length > maxShapes) return { shapes: [], skipped: true };
    }
    active.clear();
    for (const [key, rect] of nextActive.entries()) active.set(key, rect);
  }
  finished.push(...active.values());
  if (finished.length > maxShapes) return { shapes: [], skipped: true };
  const shapes = finished
    .filter((rect) => rect.w >= step && rect.h >= step)
    .map((rect, index) => residualPrimitiveShape(`${idPrefix}-${index + 1}`, rect, raster, targetBox, slideSize));
  return { shapes, skipped: false };
}

function residualForegroundRuns(raster, y, step, background) {
  const runs = [];
  let active = null;
  for (let x = 0; x < raster.width; x += step) {
    const color = dominantBlockColor(raster, x, y, step);
    const fill = residualForegroundFill(color, background);
    if (!fill) {
      if (active) {
        runs.push(active);
        active = null;
      }
      continue;
    }
    if (active && active.fill === fill && active.x + active.w === x) active.w += step;
    else {
      if (active) runs.push(active);
      active = { x, w: step, fill };
    }
  }
  if (active) runs.push(active);
  return runs.filter((run) => run.w >= step * 2);
}

function residualForegroundFill(color, background) {
  if (!color || color.a < 128) return "";
  const distance = colorDistance(color, background);
  if (distance < 18) return "";
  if (brightness(color) > 248 && saturationProxy(color) < 10) return "";
  return rgbToHex(color);
}

function dominantBlockColor(raster, x, y, step) {
  const buckets = new Map();
  for (let yy = y; yy < Math.min(raster.height, y + step); yy += 1) {
    for (let xx = x; xx < Math.min(raster.width, x + step); xx += 1) {
      const color = rasterPixel(raster, xx, yy);
      if (!color || color.a < 128) continue;
      const key = `${Math.round(color.r / 10)},${Math.round(color.g / 10)},${Math.round(color.b / 10)}`;
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += color.r;
      bucket.g += color.g;
      bucket.b += color.b;
      buckets.set(key, bucket);
    }
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return null;
  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
    a: 255
  };
}

function estimateResidualBackground(raster) {
  const samples = [];
  const margin = Math.max(1, Math.floor(Math.min(raster.width, raster.height) * 0.04));
  for (let y = 0; y < raster.height; y += Math.max(1, Math.floor(raster.height / 24))) {
    for (let x = 0; x < raster.width; x += Math.max(1, Math.floor(raster.width / 24))) {
      if (x > margin && x < raster.width - margin && y > margin && y < raster.height - margin) continue;
      const color = rasterPixel(raster, x, y);
      if (color && color.a >= 128) samples.push(color);
    }
  }
  if (samples.length === 0) return { r: 255, g: 255, b: 255, a: 255 };
  const buckets = new Map();
  for (const color of samples) {
    const key = `${Math.round(color.r / 12)},${Math.round(color.g / 12)},${Math.round(color.b / 12)}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += color.r;
    bucket.g += color.g;
    bucket.b += color.b;
    buckets.set(key, bucket);
  }
  const winner = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!winner) return { r: 255, g: 255, b: 255, a: 255 };
  return {
    r: Math.round(winner.r / winner.count),
    g: Math.round(winner.g / winner.count),
    b: Math.round(winner.b / winner.count),
    a: 255
  };
}

function residualPrimitiveShape(id, rect, raster, targetBox, slideSize) {
  const x = targetBox.x + rect.x * targetBox.w / raster.width;
  const y = targetBox.y + rect.y * targetBox.h / raster.height;
  const w = rect.w * targetBox.w / raster.width;
  const h = rect.h * targetBox.h / raster.height;
  return {
    id,
    type: "rect",
    box: {
      x: round(Math.max(0, Math.min(slideSize.widthPt, x))),
      y: round(Math.max(0, Math.min(slideSize.heightPt, y))),
      w: round(Math.max(0.1, Math.min(slideSize.widthPt, x + w) - Math.max(0, x))),
      h: round(Math.max(0.1, Math.min(slideSize.heightPt, y + h) - Math.max(0, y)))
    },
    style: { fill: rect.fill, stroke: rect.fill, strokeWidthPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "native-residual-primitive-rect",
      componentQualityIgnore: true
    }
  };
}

function rasterPixel(raster, x, y) {
  if (!isRaster(raster) || x < 0 || y < 0 || x >= raster.width || y >= raster.height) return null;
  const offset = (Math.floor(y) * raster.width + Math.floor(x)) * 4;
  return {
    r: raster.rgba[offset] ?? 0,
    g: raster.rgba[offset + 1] ?? 0,
    b: raster.rgba[offset + 2] ?? 0,
    a: raster.rgba[offset + 3] ?? 0
  };
}

function isRaster(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isSafeInteger(value.width)
    && Number.isSafeInteger(value.height)
    && value.width > 0
    && value.height > 0
    && value.rgba instanceof Uint8Array;
}

function isFiniteBox(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])))
    && Number(value.w) > 0
    && Number(value.h) > 0;
}

function isSlideSize(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(Number(value.widthPt))
    && Number.isFinite(Number(value.heightPt))
    && Number(value.widthPt) > 0
    && Number(value.heightPt) > 0;
}

function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

function brightness(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function saturationProxy(color) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function rgbToHex(color) {
  const part = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function nativeOnlyResidualQualityAcceptable({ baselineQuality, candidateQuality, baselineDeck, candidateDeck }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (!visualFidelityPassed(candidateQuality)) return false;
  const baselineRaster = largeRasterEditability(baselineDeck);
  const candidateRaster = largeRasterEditability(candidateDeck);
  if (baselineRaster.passed || !candidateRaster.passed) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  return pixelAfter <= pixelBefore + 0.012
    && missingAfter <= missingBefore + 0.05
    && deltaAfter <= deltaBefore + 2.25;
}

function visualFidelityPassed(quality) {
  return Array.isArray(quality?.checks)
    && quality.checks.some((check) => check?.name === "visual-fidelity" && check.passed === true);
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

function prioritizeComponentWorstByContribution(quality, { targetKinds = [] } = {}) {
  if (!quality || !Array.isArray(quality.componentWorst) || quality.componentWorst.length < 2) return quality;
  const allowed = new Set(Array.isArray(targetKinds) ? targetKinds.map((item) => String(item)) : []);
  const prioritized = [...quality.componentWorst].sort((left, right) => {
    const leftAllowed = allowed.size < 1 || allowed.has(String(left?.kind || ""));
    const rightAllowed = allowed.size < 1 || allowed.has(String(right?.kind || ""));
    if (leftAllowed !== rightAllowed) return Number(rightAllowed) - Number(leftAllowed);
    const leftScore = Number(left?.contributionScore || 0);
    const rightScore = Number(right?.contributionScore || 0);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return Number(right?.severity || 0) - Number(left?.severity || 0);
  });
  return { ...quality, componentWorst: prioritized };
}

const NATIVE_ONLY_COMPONENT_FIDELITY_PRIMITIVE_BUDGETS = Object.freeze([80]);

function replacePictorialIconCropsWithNativeShapes(deck, root) {
  if (!deck || typeof deck !== "object" || !Array.isArray(deck.pages) || typeof root !== "string" || !path.isAbsolute(root)) return null;
  const ownership = proposeNativeOwnedGraphics(deck, root);
  if (ownership) return ownership;
  const next = structuredClone(deck);
  let vectorizedImages = 0;
  let nativeShapes = 0;
  for (const page of next.pages) {
    if (!page || typeof page !== "object" || !Array.isArray(page.images)) continue;
    const keptImages = [];
    const addedShapes = [];
    for (const image of page.images) {
      if (!isReplaceablePictorialIconCrop(image)) {
        keptImages.push(image);
        continue;
      }
      const assetPath = typeof image.assetPath === "string" ? image.assetPath : "";
      let sourceImage;
      try {
        sourceImage = readPng(path.join(root, ...safeAssetPath(assetPath).split("/")));
      } catch {
        keptImages.push(image);
        continue;
      }
      const shapes = vectorizeDensePictorialIcon({
        image: sourceImage,
        box: image.box,
        idPrefix: `${image.id || "pictorial-icon"}-native`,
        sourceImageId: image.id || null
      });
      if (shapes.length < 1) {
        keptImages.push(image);
        continue;
      }
      vectorizedImages += 1;
      nativeShapes += shapes.length;
      addedShapes.push(...shapes);
    }
    page.images = keptImages;
    page.shapes = [...(Array.isArray(page.shapes) ? page.shapes : []), ...addedShapes];
  }
  return vectorizedImages > 0 ? { deck: next, vectorizedImages, nativeShapes } : null;
}

function isReplaceablePictorialIconCrop(image) {
  if (!image || typeof image !== "object") return false;
  if (!image.box || ![image.box.x, image.box.y, image.box.w, image.box.h].every(Number.isFinite) || image.box.w <= 0 || image.box.h <= 0) return false;
  const source = image.source && typeof image.source === "object" ? image.source : {};
  return source.detector === "knowledge-graph-semantic-icon-crop"
    && source.protectedMinimumUnit === true
    && source.expressionForm === "icon-or-illustration"
    && source.intentionalMinimumUnitCrop === true;
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

function nativeOnlySemanticChecksPass(deck) {
  return largeRasterEditability(deck).passed
    && auditNativeComponentQuality(deck).passed
    && auditSemanticEditability(deck).passed;
}

function nativeOnlyRefinementImproves({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  return pixelAfter < pixelBefore - 0.0002
    && missingAfter <= missingBefore + 0.002
    && deltaAfter <= deltaBefore + 0.1;
}

function nativeOnlyRefinementDoesNotMateriallyRegress({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  return pixelAfter <= pixelBefore + 0.0005
    && missingAfter <= missingBefore + 0.002
    && deltaAfter <= deltaBefore + 0.15;
}

function nativeOnlyMissingNativeLinesDoesNotRegress({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.02) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  if (pixelAfter > pixelBefore + 1e-9) return false;
  if (missingAfter > missingBefore + 0.0002) return false;
  if (deltaAfter > deltaBefore + 0.02) return false;
  const attentionBefore = Number(before["component-regions-attention"]);
  const attentionAfter = Number(after["component-regions-attention"]);
  if (Number.isFinite(attentionBefore) && Number.isFinite(attentionAfter) && attentionAfter > attentionBefore) return false;
  const severityBefore = Number(before["worst-component-normalized-severity"]);
  const severityAfter = Number(after["worst-component-normalized-severity"]);
  if (Number.isFinite(severityBefore) && Number.isFinite(severityAfter) && severityAfter > severityBefore + 1e-9) return false;
  return true;
}

function nativeOnlyMissingNativeTargetBudgets(targetCount) {
  const total = Number.isSafeInteger(targetCount) && targetCount > 0 ? targetCount : 24;
  return [...new Set([1, 2, 3, 4, 5, 6, 8, 12, total].filter((value) => value > 0 && value <= total))];
}

function adoptNativeOnlyResidualCandidate({ metadata, nativeOnlyCandidate, root }) {
  validateDeckIr(nativeOnlyCandidate.deck, root);
  const retainedErasure = require('./retained-residual-deduplication').retainResidualDeduplication(
    metadata.generatedDeck, nativeOnlyCandidate.deck, metadata.residualDeduplication);
  metadata.generatedDeck = nativeOnlyCandidate.deck;
  metadata.deckFile = nativeOnlyCandidate.deckFile;
  metadata.nativeMetrics = nativeObjectMetrics(nativeOnlyCandidate.deck);
  metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(nativeOnlyCandidate.deck);
  metadata.residualDeduplication = residualDeduplicationStatus(nativeOnlyCandidate.deck, retainedErasure);
  metadata.nativeComponentQuality = auditNativeComponentQuality(nativeOnlyCandidate.deck);
  const validated = validateDeckIr(nativeOnlyCandidate.deck, root);
  metadata.pages = validated.pages;
  metadata.assets = validated.assets;
}

function nativeOnlyResidualRejectionMetrics(nativeOnlyCandidate, nativeOnlyPolicy, prefix = "native-only-residual") {
  if (!nativeOnlyCandidate || nativeOnlyCandidate.rejected === true) return {};
  const metrics = nativeOnlyCandidate.quality?.metrics || {};
  return {
    ...(Number.isFinite(Number(metrics["pixel-diff-ratio"])) ? { [`${prefix}-candidate-pixel-diff-ratio`]: Number(metrics["pixel-diff-ratio"]) } : {}),
    ...(Number.isFinite(Number(metrics["foreground-missing-ratio"])) ? { [`${prefix}-candidate-foreground-missing-ratio`]: Number(metrics["foreground-missing-ratio"]) } : {}),
    ...(Number.isFinite(Number(metrics["mean-absolute-delta"])) ? { [`${prefix}-candidate-mean-absolute-delta`]: Number(metrics["mean-absolute-delta"]) } : {}),
    ...(Number.isFinite(Number(metrics["component-regions-attention"])) ? { [`${prefix}-candidate-attention-components`]: Number(metrics["component-regions-attention"]) } : {}),
    ...(nativeOnlyPolicy?.reasons?.includes("visual-fidelity") ? { [`${prefix}-visual-fidelity-rejected`]: 1 } : {}),
    ...(nativeOnlyPolicy?.reasons?.includes("visual-regressed") ? { [`${prefix}-visual-regressed`]: 1 } : {}),
    ...(metrics["native-only-pre-policy-text-refinement-accepted"] !== undefined ? { [`${prefix}-text-refinement-accepted`]: metrics["native-only-pre-policy-text-refinement-accepted"] } : {}),
    ...(metrics["native-only-text-refinement-blocked-scene"] === 1 ? { [`${prefix}-text-refinement-blocked-scene`]: 1 } : {}),
    ...(metrics["native-only-pre-policy-text-refinement-proposed-boxes"] !== undefined ? { [`${prefix}-text-refinement-proposed-boxes`]: metrics["native-only-pre-policy-text-refinement-proposed-boxes"] } : {}),
    ...(metrics["native-only-missing-native-lines-accepted"] !== undefined ? { [`${prefix}-missing-native-lines-accepted`]: metrics["native-only-missing-native-lines-accepted"] } : {}),
    ...(metrics["native-only-missing-native-lines-shapes"] !== undefined ? { [`${prefix}-missing-native-lines-shapes`]: metrics["native-only-missing-native-lines-shapes"] } : {}),
    ...(metrics["native-only-missing-native-lines-targets"] !== undefined ? { [`${prefix}-missing-native-lines-targets`]: metrics["native-only-missing-native-lines-targets"] } : {}),
    ...(metrics["native-only-pictorial-icons-attempted"] !== undefined ? { [`${prefix}-pictorial-icons-attempted`]: metrics["native-only-pictorial-icons-attempted"] } : {}),
    ...(metrics["native-only-pictorial-icons-vectorized"] !== undefined ? { [`${prefix}-pictorial-icons-vectorized`]: metrics["native-only-pictorial-icons-vectorized"] } : {}),
    ...(metrics["native-only-pictorial-icons-shapes"] !== undefined ? { [`${prefix}-pictorial-icons-shapes`]: metrics["native-only-pictorial-icons-shapes"] } : {}),
    ...(metrics["native-only-pictorial-icons-accepted"] !== undefined ? { [`${prefix}-pictorial-icons-accepted`]: metrics["native-only-pictorial-icons-accepted"] } : {}),
    ...(metrics["native-only-pictorial-icons-rejected"] !== undefined ? { [`${prefix}-pictorial-icons-rejected`]: metrics["native-only-pictorial-icons-rejected"] } : {}),
    ...(metrics["native-only-pictorial-icons-semantic-rejected"] !== undefined ? { [`${prefix}-pictorial-icons-semantic-rejected`]: metrics["native-only-pictorial-icons-semantic-rejected"] } : {}),
    ...(metrics["native-only-pictorial-icons-visual-regressed"] !== undefined ? { [`${prefix}-pictorial-icons-visual-regressed`]: metrics["native-only-pictorial-icons-visual-regressed"] } : {}),
    ...(metrics["native-only-pictorial-icons-candidate-pixel-diff-ratio"] !== undefined ? { [`${prefix}-pictorial-icons-candidate-pixel-diff-ratio`]: metrics["native-only-pictorial-icons-candidate-pixel-diff-ratio"] } : {}),
    ...(metrics["native-only-pictorial-icons-candidate-foreground-missing-ratio"] !== undefined ? { [`${prefix}-pictorial-icons-candidate-foreground-missing-ratio`]: metrics["native-only-pictorial-icons-candidate-foreground-missing-ratio"] } : {}),
    ...(metrics["native-only-pictorial-icons-candidate-mean-absolute-delta"] !== undefined ? { [`${prefix}-pictorial-icons-candidate-mean-absolute-delta`]: metrics["native-only-pictorial-icons-candidate-mean-absolute-delta"] } : {})
  };
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

function shouldTryNativeOnlyPrePolicyTextRefinement(visualQuality) {
  return qualityRendered(visualQuality) && visualQuality?.passed !== true && hasAttentionTextWorstComponent(visualQuality);
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
function createImageToEditableArchiveHandler({ objectStore, temporaryRoot = os.tmpdir(), builderExecutable = process.env.OPENXML_BUILDER_EXE || "/opt/openxml/OpenXmlDeckBuilder", builderArgs = [], documentNormalizer, rawImageOcr, rawImageRebuilder, rawImageQualityVerifier, rawImageTextRefiner, rawImageOwnedTextRefiner, rawImageTypographyRefiner, createDelivery, requiredReconstructionProfile, ocrCheckpointFingerprint, timeoutMs = 8 * 60 * 1000 } = {}) {
  const store = assertObjectStore(objectStore);
  const ocrCheckpoint = ocrCheckpointFingerprint === undefined ? undefined : createOcrCheckpoint({ objectStore: store, profileFingerprint: ocrCheckpointFingerprint });
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 9 * 60 * 1000) throw new RangeError("editable worker timeout is invalid");
  if (documentNormalizer !== undefined && typeof documentNormalizer !== "function") throw new TypeError("documentNormalizer must be a function");
  if (rawImageQualityVerifier !== undefined && typeof rawImageQualityVerifier !== "function") throw new TypeError("rawImageQualityVerifier must be a function");
  if (rawImageTextRefiner !== undefined && typeof rawImageTextRefiner !== "function") throw new TypeError("rawImageTextRefiner must be a function");
  if (rawImageOwnedTextRefiner !== undefined && typeof rawImageOwnedTextRefiner !== "function") throw new TypeError("rawImageOwnedTextRefiner must be a function");
  if (rawImageTypographyRefiner !== undefined && typeof rawImageTypographyRefiner !== "function") throw new TypeError("rawImageTypographyRefiner must be a function");
  if (createDelivery !== undefined && typeof createDelivery !== "function") throw new TypeError("createDelivery must be a function");
  if (requiredReconstructionProfile !== undefined && (typeof requiredReconstructionProfile !== "string" || !/^[a-z0-9][a-z0-9.-]{2,63}$/u.test(requiredReconstructionProfile))) throw new TypeError("required reconstruction profile is invalid");
  if (rawImageQualityVerifier) rawImageQualityVerifier = budgetedQualityVerifier(rawImageQualityVerifier);
  return createBudgetedWorkerHandler(async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "image-to-editable" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("editable worker job is invalid");
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const archive = await runWorkerStage("IMAGE_INPUT_READ_FAILED", () => store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES }));
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-editable-"));
    const nativeShadowSession = createNativeOnlyShadowSession({ assess: assessStrictNativeCandidate,
      hasMeasuredGain: hasMeasuredVisualGain, validateDeck: validateDeckIr });
    const nativeShadowPolicy = { builderExecutable, builderArgs, timeoutMs, requiredReconstructionProfile };
    try {
      extractProjectArchive(archive, root, { label: "editable" });
      const metadata = validatePackage(root);
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (metadata.kind === "raw-document") {
        if (typeof documentNormalizer !== "function") throw new Error("document editable normalization profile is not enabled for this worker");
        const normalized = await runWorkerStage("IMAGE_NORMALIZATION_FAILED", async () => admitNormalizedPages(await documentNormalizer({ root, metadata, isCancellationRequested }), root));
        metadata.sources = normalized.sources; metadata.pages = normalized.pages; metadata.assets = normalized.assets;
      }
      let ocrResults;
      let baselineRebuild;
      let deliveredOcrCropRecovery = null;
      if (metadata.kind === "raw-image" || metadata.kind === "raw-document") {
        if (typeof rawImageOcr !== "function") throw new WorkerFailure("IMAGE_OCR_NOT_CONFIGURED");
        if (typeof rawImageRebuilder !== "function") throw new Error("raw editable native rebuild profile is not enabled for this worker");
        ocrResults = new Map();
        const rebuilt = await rebuildRawImages({ root, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job, ocrResults });
        baselineRebuild = rebuilt;
        deliveredOcrCropRecovery = rebuilt.ocrCropRecovery;
        const generatedDeck = rebuilt?.deck;
        metadata.deckFile = path.join(root, "deck.json");
        fs.writeFileSync(metadata.deckFile, `${JSON.stringify(generatedDeck)}\n`, "utf8");
        const validated = validateDeckIr(generatedDeck, root);
        const nativeMetrics = nativeObjectMetrics(generatedDeck);
        const residualDeduplication = residualDeduplicationStatus(generatedDeck, rebuilt?.residual);
        metadata.pages = validated.pages; metadata.assets = validated.assets; metadata.nativeMetrics = nativeMetrics; metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(generatedDeck); metadata.normalizedSourceImages = rebuilt.sourceImages;
        metadata.residualDeduplication = residualDeduplication;
        metadata.reconstructionProfile = rebuilt.reconstructionProfile;
        metadata.nativeComponentQuality = rebuilt.nativeComponentQuality;
        metadata.ocrCropRecovery = rebuilt.ocrCropRecovery;
        metadata.generatedDeck = generatedDeck;
      }
      let outputFile = path.join(root, createDelivery ? "source.pptx" : "deck.pptx");
      await runWorkerStage("IMAGE_BUILD_FAILED", () => runBuilder({ executable: builderExecutable, builderArgs, deckFile: metadata.deckFile, outputFile, cwd: root, timeoutMs, isCancellationRequested }));
      if (!fs.existsSync(outputFile) || !fs.statSync(outputFile).isFile() || fs.statSync(outputFile).size < 1 || fs.statSync(outputFile).size > MAX_PPTX_BYTES) throw new Error("editable builder produced an invalid artifact");
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const raw = metadata.kind === "raw-image" || metadata.kind === "raw-document";
      let sourceImages = raw ? metadata.normalizedSourceImages : metadata.structuredSourceImages;
      const visualVerificationEnabled = Array.isArray(sourceImages);
      let verificationDeck = raw ? metadata.generatedDeck : metadata.structuredDeck;
      let renderedImages = [];
      let bestRejectedRecovery = null;
      let adoptedOcrRecovery = false;
      let adoptedNativeOnlyResidual = false;
      let textRefinementExplicitlyRejected = false;
      let visualQuality = visualVerificationEnabled && rawImageQualityVerifier
        ? await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageQualityVerifier({ root, pptxFile: outputFile, sourceImage: sourceImages[0], sourceImages, deck: verificationDeck, isCancellationRequested, collectRenderedPages: pages => { renderedImages = pages; } }))
        : null;
      if (raw && rawImageQualityVerifier && ocrRecoveryCandidateScopes(baselineRebuild).length > 0
        && qualityRendered(visualQuality)) {
        const recoveryScopes = ocrRecoveryCandidateScopes(baselineRebuild);
        for (let index = 0; index < recoveryScopes.length; index += 1) {
          const candidateRoot = path.join(root, `.ocr-recovery-candidate-${index + 1}`);
          fs.mkdirSync(candidateRoot, { recursive: true });
          const candidate = await rebuildRawImages({ root: candidateRoot, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job, ocrResults, recoverOcrCropText: true, recoveryScope: recoveryScopes[index] });
          if (candidate.ocrCropRecovery.recovered < 1) continue;
          const candidateDeckFile = path.join(candidateRoot, "deck.json");
          const candidateOutputFile = path.join(candidateRoot, "deck.pptx");
          fs.writeFileSync(candidateDeckFile, `${JSON.stringify(candidate.deck)}\n`, "utf8");
          validateDeckIr(candidate.deck, candidateRoot);
          await runWorkerStage("IMAGE_BUILD_FAILED", () => runBuilder({ executable: builderExecutable, builderArgs, deckFile: candidateDeckFile, outputFile: candidateOutputFile, cwd: candidateRoot, timeoutMs, isCancellationRequested }));
          if (!fs.existsSync(candidateOutputFile) || !fs.statSync(candidateOutputFile).isFile() || fs.statSync(candidateOutputFile).size < 1 || fs.statSync(candidateOutputFile).size > MAX_PPTX_BYTES) throw new Error("editable builder produced an invalid candidate artifact");
          let candidateRenderedImages = [];
          const candidateQuality = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageQualityVerifier({ root: candidateRoot, pptxFile: candidateOutputFile, sourceImage: candidate.sourceImages[0], sourceImages: candidate.sourceImages, deck: candidate.deck, isCancellationRequested, collectRenderedPages: pages => { candidateRenderedImages = pages; } }));
          if (selectOcrRecovery({ baseline: baselineRebuild, candidate, baselineQuality: visualQuality, candidateQuality })) {
            adoptOcrRecovery({ root, metadata, candidate, candidateRoot, candidateDeckFile, candidateOutputFile, outputFile });
            adoptedOcrRecovery = true;
            deliveredOcrCropRecovery = candidate.ocrCropRecovery;
            sourceImages = candidate.sourceImages; verificationDeck = candidate.deck;
            visualQuality = candidateQuality; renderedImages = candidateRenderedImages;
            break;
          }
          if (Number.isFinite(candidateQuality?.metrics?.["pixel-diff-ratio"])
            && (!bestRejectedRecovery || candidateQuality.metrics["pixel-diff-ratio"] < bestRejectedRecovery.quality.metrics["pixel-diff-ratio"])) {
            bestRejectedRecovery = { candidate, root: candidateRoot, deckFile: candidateDeckFile, pptxFile: candidateOutputFile, quality: candidateQuality, renderedImages: candidateRenderedImages };
          }
          if (shouldStopOcrRecoverySearch({ baselineQuality: visualQuality, candidateQuality })) break;
        }
      }
      // Resolve an uneditable page raster before spending typography candidates
      // on a representation that cannot pass the final publication gate.
      if (raw && rawImageQualityVerifier && rawImageTextRefiner && renderedImages.length && shouldTryFinalWorstTextRefinement(visualQuality)
        && largeRasterEditability(metadata.generatedDeck).passed) {
        const refinementStartedAt = Date.now();
        const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
          root, deckFile: metadata.deckFile, pptxFile: outputFile, deck: metadata.generatedDeck, acceptImprovedFailure: true,
          sourceImages: metadata.normalizedSourceImages, renderedImages, initialQuality: visualQuality, isCancellationRequested,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages: metadata.normalizedSourceImages, deck, isCancellationRequested })
        }));
        assertTextRefinementResult(refined);
        textRefinementExplicitlyRejected = refined.accepted !== true;
        if (refined.accepted) {
          validateDeckIr(refined.deck, root);
          metadata.generatedDeck = refined.deck; metadata.deckFile = refined.deckFile; outputFile = refined.pptxFile; verificationDeck = refined.deck; visualQuality = refined.quality;
        }
        visualQuality = { ...visualQuality, metrics: { ...visualQuality.metrics, "text-refinement-accepted": Number(refined.accepted), "text-refinement-proposed-boxes": refined.changedTextBoxes, "text-refinement-milliseconds": Date.now() - refinementStartedAt, ...(refined.skippedPixelBudget ? {"text-refinement-skipped-pixel-budget": refined.skippedPixelBudget} : {}) } };
      }
      if (raw && rawImageQualityVerifier && qualityRendered(visualQuality) && !largeRasterEditability(metadata.generatedDeck).passed) {
        let nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildNativeOnlyResidualCandidate({
          root, metadata, outputFile, rawImageQualityVerifier, sourceImages: metadata.normalizedSourceImages, isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => refineNativeOnlyResidualCandidateText({
          nativeOnlyCandidate,
          root,
          rawImageTextRefiner,
          rawImageOwnedTextRefiner,
          sourceImages: metadata.normalizedSourceImages,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => refineNativeOnlyResidualCandidateMissingNativeLines({
          nativeOnlyCandidate,
          root,
          sourceImages: metadata.normalizedSourceImages,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (nativeOnlyCandidate && nativeOnlyCandidate.rejected !== true) {
          const pictorialNativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildNativeOnlyPictorialIconCandidate({
            root,
            baseline: nativeOnlyCandidate,
            sourceImages: metadata.normalizedSourceImages,
            rawImageQualityVerifier,
            isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = pictorialNativeOnlyCandidate || nativeOnlyCandidate;
        }
        nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => searchProvisionalNativeCandidate({
          root, candidate: nativeOnlyCandidate, baselineQuality: visualQuality, baselineDeck: metadata.generatedDeck, refineOwnedTexts: rawImageOwnedTextRefiner, refineNativeStrokes: refineNativeOnlyStrokes,
          sourceImages: metadata.normalizedSourceImages, rawImageQualityVerifier, isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        await runWorkerStage("IMAGE_QUALITY_FAILED", () => nativeShadowSession.checkpoint({ root,
          baselineDeck: metadata.generatedDeck, baselineQuality: visualQuality, candidate: nativeOnlyCandidate,
          sourceImages: metadata.normalizedSourceImages, policy: nativeShadowPolicy }));
        const nativeOnlyPolicy = nativeOnlyCandidate?.rejected === true ? null : assessStrictNativeCandidate({
          baselineQuality: visualQuality,
          baselineDeck: metadata.generatedDeck,
          candidateQuality: nativeOnlyCandidate?.quality,
          candidateDeck: nativeOnlyCandidate?.deck
        });
        if (nativeOnlyCandidate && nativeOnlyResidualQualityAcceptable({
          baselineQuality: visualQuality,
          candidateQuality: nativeOnlyCandidate.quality,
          baselineDeck: metadata.generatedDeck,
          candidateDeck: nativeOnlyCandidate.deck
        }) && nativeOnlyPolicy?.passed === true) {
          adoptNativeOnlyResidualCandidate({ metadata, nativeOnlyCandidate, root });
          outputFile = nativeOnlyCandidate.pptxFile; verificationDeck = nativeOnlyCandidate.deck;
          visualQuality = {
            ...nativeOnlyCandidate.quality,
            metrics: {
              ...nativeOnlyCandidate.quality.metrics,
              "native-only-residual-removed": nativeOnlyCandidate.removed,
              "native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
          visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(visualQuality);
          adoptedNativeOnlyResidual = true;
          if (rawImageTextRefiner && nativeOnlyCandidate.renderedImages?.length && shouldTryFinalWorstTextRefinement(visualQuality)) {
            const refinementStartedAt = Date.now();
            const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
              root,
              deckFile: metadata.deckFile,
              pptxFile: outputFile,
              deck: metadata.generatedDeck,
              sourceImages: metadata.normalizedSourceImages,
              renderedImages: nativeOnlyCandidate.renderedImages,
              initialQuality: visualQuality,
              isCancellationRequested,
              acceptImprovedFailure: true,
              buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
              verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages: metadata.normalizedSourceImages, deck, isCancellationRequested })
            }));
            assertTextRefinementResult(refined);
            if (refined.accepted) {
              validateDeckIr(refined.deck, root);
              metadata.generatedDeck = refined.deck; metadata.deckFile = refined.deckFile; outputFile = refined.pptxFile; verificationDeck = refined.deck;
              metadata.nativeMetrics = nativeObjectMetrics(refined.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(refined.deck);
              const validated = validateDeckIr(refined.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
              visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(refined.quality);
            }
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "native-only-text-refinement-accepted": Number(refined.accepted),
                "native-only-text-refinement-proposed-boxes": refined.changedTextBoxes,
                "native-only-text-refinement-milliseconds": Date.now() - refinementStartedAt,
                ...(refined.skippedPixelBudget ? { "native-only-text-refinement-skipped-pixel-budget": refined.skippedPixelBudget } : {})
              }
            };
          }
        } else if (nativeOnlyCandidate) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "native-only-residual-rejected": 1,
              ...(nativeOnlyCandidate.rejected === true ? { "native-only-residual-rejection-code": nativeOnlyCandidate.rejectionCode } : {}),
              ...(nativeOnlyPolicy && nativeOnlyPolicy.passed !== true ? { "native-only-residual-policy-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("semantic-editability") ? { "native-only-residual-semantic-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("native-component-quality") ? { "native-only-residual-component-rejected": 1 } : {}),
              ...nativeOnlyResidualRejectionMetrics(nativeOnlyCandidate, nativeOnlyPolicy),
              "native-only-residual-removed": nativeOnlyCandidate.removed,
              "native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
        }
      }
      if (bestRejectedRecovery && metadata.ocrCropRecovery?.recovered === 0 && rawImageTextRefiner
        && bestRejectedRecovery.renderedImages.length && qualityRendered(visualQuality)
        && !shouldStopOcrRecoverySearch({ baselineQuality: visualQuality, candidateQuality: bestRejectedRecovery.quality })) {
        const prior = bestRejectedRecovery;
        const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
          root: prior.root, deckFile: prior.deckFile, pptxFile: prior.pptxFile, deck: prior.candidate.deck,
          sourceImages: prior.candidate.sourceImages, renderedImages: prior.renderedImages, initialQuality: prior.quality,
          isCancellationRequested, acceptImprovedFailure: true,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: prior.root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root: prior.root, pptxFile, sourceImages: prior.candidate.sourceImages, deck, isCancellationRequested })
        }));
        assertTextRefinementResult(refined);
        if (refined.accepted) {
          const candidate = { ...prior.candidate, deck: refined.deck };
          if (selectOcrRecovery({ baseline: baselineRebuild, candidate, baselineQuality: visualQuality, candidateQuality: refined.quality })) {
            adoptOcrRecovery({ root, metadata, candidate, candidateRoot: prior.root, candidateDeckFile: refined.deckFile, candidateOutputFile: refined.pptxFile, outputFile });
            adoptedOcrRecovery = true;
            deliveredOcrCropRecovery = candidate.ocrCropRecovery;
            sourceImages = candidate.sourceImages; verificationDeck = candidate.deck;
            visualQuality = { ...refined.quality, metrics: { ...refined.quality.metrics, "text-refinement-accepted": 1, "text-refinement-proposed-boxes": refined.changedTextBoxes } };
          }
        }
      }
      if (raw && !adoptedNativeOnlyResidual && !textRefinementExplicitlyRejected && qualityRendered(visualQuality)
        && !topWorstComponentNeedsNativeShapeRefinement(visualQuality)
        && (visualQuality?.passed !== true || !largeRasterEditability(metadata.generatedDeck).passed)) {
        let fallbackSource = null;
        if (bestRejectedRecovery?.candidate?.ocrCropRecovery?.recovered > (metadata.ocrCropRecovery?.recovered || 0)) {
          fallbackSource = {
            metadata: { ...metadata, generatedDeck: mergeRecoveredOcrTextForFallback(metadata.generatedDeck, bestRejectedRecovery.candidate.deck) },
            sourceImages: bestRejectedRecovery.candidate.sourceImages,
            ocrCropRecovery: bestRejectedRecovery.candidate.ocrCropRecovery
          };
        }
        const recoveredFallback = fallbackSource ? await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildVisualFallback({
          root, sourceImages: fallbackSource.sourceImages, metadata: fallbackSource.metadata, outputFile, rawImageQualityVerifier, isCancellationRequested,
          fallbackPrefix: "ocr-rich-",
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        })) : null;
        const baselineFallback = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildVisualFallback({
          root, sourceImages: metadata.normalizedSourceImages, metadata, outputFile, rawImageQualityVerifier, isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        const useRecoveredFallback = recoveredFallback && baselineFallback
          && deckHasRecoveredOcrText(recoveredFallback.deck)
          && visualQualityDoesNotRegress({ baselineQuality: baselineFallback.quality, candidateQuality: recoveredFallback.quality })
          && visualQualityDoesNotRegress({ baselineQuality: visualQuality, candidateQuality: recoveredFallback.quality });
        const fallback = useRecoveredFallback ? recoveredFallback : baselineFallback;
        if (!useRecoveredFallback) fallbackSource = null;
        if (fallback) {
          validateDeckIr(fallback.deck, root);
          metadata.generatedDeck = fallback.deck; metadata.deckFile = fallback.deckFile; outputFile = fallback.pptxFile; verificationDeck = fallback.deck;
          const fallbackNativeMetrics = nativeObjectMetrics(fallback.deck);
          metadata.nativeMetrics = fallbackNativeMetrics; metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(fallback.deck);
          metadata.nativeComponentQuality = fallback.nativeComponentQuality; metadata.residualDeduplication = residualDeduplicationStatus(fallback.deck, { candidateObjects: 0, erasedObjects: 0 });
          if (fallbackSource?.ocrCropRecovery) {
            metadata.ocrCropRecovery = fallbackSource.ocrCropRecovery;
            deliveredOcrCropRecovery = fallbackSource.ocrCropRecovery;
            metadata.normalizedSourceImages = fallbackSource.sourceImages;
          } else if (!deckHasRecoveredOcrText(fallback.deck)) {
            metadata.ocrCropRecovery = baselineRebuild?.ocrCropRecovery || fallback.deck?.meta?.ocrCropRecovery || metadata.ocrCropRecovery;
            deliveredOcrCropRecovery = metadata.ocrCropRecovery;
          } else {
            const keepAdoptedRecovery = adoptedOcrRecovery
              && visualQualityDoesNotRegress({ baselineQuality: fallback.quality, candidateQuality: visualQuality });
            metadata.ocrCropRecovery = keepAdoptedRecovery
              ? metadata.ocrCropRecovery
              : baselineRebuild?.ocrCropRecovery || fallback.deck?.meta?.ocrCropRecovery || metadata.ocrCropRecovery;
            deliveredOcrCropRecovery = metadata.ocrCropRecovery;
          }
          const recoveredTextBoxes = countRecoveredOcrTextBoxes(fallback.deck);
          if (recoveredTextBoxes > 0 && (deliveredOcrCropRecovery?.recovered || 0) > recoveredTextBoxes) {
            deliveredOcrCropRecovery = { ...deliveredOcrCropRecovery, recovered: recoveredTextBoxes };
            metadata.ocrCropRecovery = deliveredOcrCropRecovery;
          }
          const validated = validateDeckIr(fallback.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = fallback.quality;
        }
      }
      if (raw && qualityRendered(visualQuality)) {
        visualQuality = blockLateVisualRefinementForLargeRaster(visualQuality, metadata.generatedDeck);
      }
      if (raw && rawImageQualityVerifier
        && topWorstComponentIsMissingNative(visualQuality)
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === undefined
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalMissingNativeVisualAtomFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalMissingNativeVisualAtomCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalMissingNativeVisualAtomFit?.accepted) {
          validateDeckIr(finalMissingNativeVisualAtomFit.deck, root);
          metadata.generatedDeck = finalMissingNativeVisualAtomFit.deck; metadata.deckFile = finalMissingNativeVisualAtomFit.deckFile; outputFile = finalMissingNativeVisualAtomFit.pptxFile; verificationDeck = finalMissingNativeVisualAtomFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalMissingNativeVisualAtomFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalMissingNativeVisualAtomFit.deck);
          const validated = validateDeckIr(finalMissingNativeVisualAtomFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = {
            ...finalMissingNativeVisualAtomFit.quality,
            metrics: {
              ...finalMissingNativeVisualAtomFit.quality.metrics,
              "final-missing-native-visual-atom-fit-accepted": 1,
              "final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit.addedShapes,
              "final-missing-native-visual-atom-fit-targets": finalMissingNativeVisualAtomFit.candidateTargets,
              "final-missing-native-visual-atom-fit-atoms": finalMissingNativeVisualAtomFit.candidateAtoms
            }
          };
        } else if (finalMissingNativeVisualAtomFit) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-missing-native-visual-atom-fit-accepted": 0,
              "final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit.addedShapes || 0,
              "final-missing-native-visual-atom-fit-targets": finalMissingNativeVisualAtomFit.candidateTargets || 0,
              "final-missing-native-visual-atom-fit-atoms": finalMissingNativeVisualAtomFit.candidateAtoms || 0
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalOcrEvidenceFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalOcrEvidenceFitCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalOcrEvidenceFit?.accepted) {
          validateDeckIr(finalOcrEvidenceFit.deck, root);
          metadata.generatedDeck = finalOcrEvidenceFit.deck; metadata.deckFile = finalOcrEvidenceFit.deckFile; outputFile = finalOcrEvidenceFit.pptxFile; verificationDeck = finalOcrEvidenceFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalOcrEvidenceFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalOcrEvidenceFit.deck);
          const validated = validateDeckIr(finalOcrEvidenceFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalOcrEvidenceFit.quality;
        }
        if (finalOcrEvidenceFit && finalOcrEvidenceFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-ocr-evidence-fit-accepted": Number(finalOcrEvidenceFit.accepted === true),
              "final-ocr-evidence-fit-text-boxes": finalOcrEvidenceFit.changedTextBoxes
            }
          };
        }
      }
      if (raw
        && topWorstComponentIsMissingNative(visualQuality)
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === 0) {
        visualQuality = {
          ...visualQuality,
          metrics: {
            ...visualQuality.metrics,
            "missing-native-late-refinement-blocked": 1
          }
        };
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-scale-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextScaleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextScaleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          targetScales: [0.94, 0.96, 1.04],
          candidateLimits: [1, 2],
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextScaleFit?.accepted) {
          validateDeckIr(finalWorstTextScaleFit.deck, root);
          metadata.generatedDeck = finalWorstTextScaleFit.deck; metadata.deckFile = finalWorstTextScaleFit.deckFile; outputFile = finalWorstTextScaleFit.pptxFile; verificationDeck = finalWorstTextScaleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextScaleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextScaleFit.deck);
          const validated = validateDeckIr(finalWorstTextScaleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextScaleFit.quality;
        }
        if (finalWorstTextScaleFit && finalWorstTextScaleFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-scale-fit-accepted": Number(finalWorstTextScaleFit.accepted === true),
              "final-worst-text-scale-fit-text-boxes": finalWorstTextScaleFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-weight-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextWeightFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextWeightCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextWeightFit?.accepted) {
          validateDeckIr(finalWorstTextWeightFit.deck, root);
          metadata.generatedDeck = finalWorstTextWeightFit.deck; metadata.deckFile = finalWorstTextWeightFit.deckFile; outputFile = finalWorstTextWeightFit.pptxFile; verificationDeck = finalWorstTextWeightFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextWeightFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextWeightFit.deck);
          const validated = validateDeckIr(finalWorstTextWeightFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextWeightFit.quality;
        }
        if (finalWorstTextWeightFit && finalWorstTextWeightFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-weight-fit-accepted": Number(finalWorstTextWeightFit.accepted === true),
              "final-worst-text-weight-fit-text-boxes": finalWorstTextWeightFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-editable-text-font-family-fit-accepted"] === undefined && shouldTryFinalEditableTextFontFamilyRefinement(visualQuality)) {
        const finalEditableTextFontFamilyFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalEditableTextFontFamilyCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalEditableTextFontFamilyFit?.accepted) {
          validateDeckIr(finalEditableTextFontFamilyFit.deck, root);
          metadata.generatedDeck = finalEditableTextFontFamilyFit.deck; metadata.deckFile = finalEditableTextFontFamilyFit.deckFile; outputFile = finalEditableTextFontFamilyFit.pptxFile; verificationDeck = finalEditableTextFontFamilyFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalEditableTextFontFamilyFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalEditableTextFontFamilyFit.deck);
          const validated = validateDeckIr(finalEditableTextFontFamilyFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalEditableTextFontFamilyFit.quality;
        }
        if (finalEditableTextFontFamilyFit && finalEditableTextFontFamilyFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-editable-text-font-family-fit-accepted": Number(finalEditableTextFontFamilyFit.accepted === true),
              "final-editable-text-font-family-fit-text-boxes": finalEditableTextFontFamilyFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextInkBoxRefinement(visualQuality)) {
        const finalWorstTextInkBoxFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextInkBoxCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextInkBoxFit?.accepted) {
          validateDeckIr(finalWorstTextInkBoxFit.deck, root);
          metadata.generatedDeck = finalWorstTextInkBoxFit.deck; metadata.deckFile = finalWorstTextInkBoxFit.deckFile; outputFile = finalWorstTextInkBoxFit.pptxFile; verificationDeck = finalWorstTextInkBoxFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextInkBoxFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextInkBoxFit.deck);
          const validated = validateDeckIr(finalWorstTextInkBoxFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextInkBoxFit.quality;
        }
        if (finalWorstTextInkBoxFit && finalWorstTextInkBoxFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-ink-box-fit-accepted": Number(finalWorstTextInkBoxFit.accepted === true),
              "final-worst-text-ink-box-fit-text-boxes": finalWorstTextInkBoxFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === undefined
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalSaturatedColorPanelFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalSaturatedColorPanelCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalSaturatedColorPanelFit?.accepted) {
          validateDeckIr(finalSaturatedColorPanelFit.deck, root);
          metadata.generatedDeck = finalSaturatedColorPanelFit.deck; metadata.deckFile = finalSaturatedColorPanelFit.deckFile; outputFile = finalSaturatedColorPanelFit.pptxFile; verificationDeck = finalSaturatedColorPanelFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalSaturatedColorPanelFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalSaturatedColorPanelFit.deck);
          const validated = validateDeckIr(finalSaturatedColorPanelFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalSaturatedColorPanelFit.quality;
        }
        if (finalSaturatedColorPanelFit && finalSaturatedColorPanelFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-saturated-color-panel-fit-accepted": Number(finalSaturatedColorPanelFit.accepted === true),
              "final-saturated-color-panel-fit-shapes": finalSaturatedColorPanelFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardGeometryFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardGeometryCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardGeometryFit?.accepted) {
          validateDeckIr(finalLightCardGeometryFit.deck, root);
          metadata.generatedDeck = finalLightCardGeometryFit.deck; metadata.deckFile = finalLightCardGeometryFit.deckFile; outputFile = finalLightCardGeometryFit.pptxFile; verificationDeck = finalLightCardGeometryFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardGeometryFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardGeometryFit.deck);
          const validated = validateDeckIr(finalLightCardGeometryFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardGeometryFit.quality;
        }
        if (finalLightCardGeometryFit && finalLightCardGeometryFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-geometry-fit-accepted": Number(finalLightCardGeometryFit.accepted === true),
              "final-light-card-geometry-fit-shapes": finalLightCardGeometryFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLowSaturationPanelFillFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowSaturationPanelFillCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLowSaturationPanelFillFit?.accepted) {
          validateDeckIr(finalLowSaturationPanelFillFit.deck, root);
          metadata.generatedDeck = finalLowSaturationPanelFillFit.deck; metadata.deckFile = finalLowSaturationPanelFillFit.deckFile; outputFile = finalLowSaturationPanelFillFit.pptxFile; verificationDeck = finalLowSaturationPanelFillFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLowSaturationPanelFillFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLowSaturationPanelFillFit.deck);
          const validated = validateDeckIr(finalLowSaturationPanelFillFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLowSaturationPanelFillFit.quality;
        }
        if (finalLowSaturationPanelFillFit && finalLowSaturationPanelFillFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-low-saturation-panel-fill-fit-accepted": Number(finalLowSaturationPanelFillFit.accepted === true),
              "final-low-saturation-panel-fill-fit-shapes": finalLowSaturationPanelFillFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextInkBoxRefinement(visualQuality)) {
        const finalWorstTextInkBoxFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextInkBoxCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextInkBoxFit?.accepted) {
          validateDeckIr(finalWorstTextInkBoxFit.deck, root);
          metadata.generatedDeck = finalWorstTextInkBoxFit.deck; metadata.deckFile = finalWorstTextInkBoxFit.deckFile; outputFile = finalWorstTextInkBoxFit.pptxFile; verificationDeck = finalWorstTextInkBoxFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextInkBoxFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextInkBoxFit.deck);
          const validated = validateDeckIr(finalWorstTextInkBoxFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextInkBoxFit.quality;
        }
        if (finalWorstTextInkBoxFit && finalWorstTextInkBoxFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-ink-box-fit-accepted": Number(finalWorstTextInkBoxFit.accepted === true),
              "final-worst-text-ink-box-fit-text-boxes": finalWorstTextInkBoxFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextInkBoxRefinement(visualQuality)) {
        const finalWorstRichOcrTextLayoutFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstRichOcrTextLayoutCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstRichOcrTextLayoutFit?.accepted) {
          validateDeckIr(finalWorstRichOcrTextLayoutFit.deck, root);
          metadata.generatedDeck = finalWorstRichOcrTextLayoutFit.deck; metadata.deckFile = finalWorstRichOcrTextLayoutFit.deckFile; outputFile = finalWorstRichOcrTextLayoutFit.pptxFile; verificationDeck = finalWorstRichOcrTextLayoutFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstRichOcrTextLayoutFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstRichOcrTextLayoutFit.deck);
          const validated = validateDeckIr(finalWorstRichOcrTextLayoutFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstRichOcrTextLayoutFit.quality;
        }
        if (finalWorstRichOcrTextLayoutFit && finalWorstRichOcrTextLayoutFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-rich-ocr-text-layout-fit-accepted": Number(finalWorstRichOcrTextLayoutFit.accepted === true),
              "final-worst-rich-ocr-text-layout-fit-text-boxes": finalWorstRichOcrTextLayoutFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextCompositeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextCompositeCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextCompositeFit?.accepted) {
          validateDeckIr(finalWorstTextCompositeFit.deck, root);
          metadata.generatedDeck = finalWorstTextCompositeFit.deck; metadata.deckFile = finalWorstTextCompositeFit.deckFile; outputFile = finalWorstTextCompositeFit.pptxFile; verificationDeck = finalWorstTextCompositeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextCompositeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextCompositeFit.deck);
          const validated = validateDeckIr(finalWorstTextCompositeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextCompositeFit.quality;
        }
        if (finalWorstTextCompositeFit && finalWorstTextCompositeFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-composite-fit-accepted": Number(finalWorstTextCompositeFit.accepted === true),
              "final-worst-text-composite-fit-text-boxes": finalWorstTextCompositeFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-scale-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextScaleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextScaleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextScaleFit?.accepted) {
          validateDeckIr(finalWorstTextScaleFit.deck, root);
          metadata.generatedDeck = finalWorstTextScaleFit.deck; metadata.deckFile = finalWorstTextScaleFit.deckFile; outputFile = finalWorstTextScaleFit.pptxFile; verificationDeck = finalWorstTextScaleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextScaleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextScaleFit.deck);
          const validated = validateDeckIr(finalWorstTextScaleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextScaleFit.quality;
        }
        if (finalWorstTextScaleFit && finalWorstTextScaleFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-scale-fit-accepted": Number(finalWorstTextScaleFit.accepted === true),
              "final-worst-text-scale-fit-text-boxes": finalWorstTextScaleFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-weight-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextWeightFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextWeightCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextWeightFit?.accepted) {
          validateDeckIr(finalWorstTextWeightFit.deck, root);
          metadata.generatedDeck = finalWorstTextWeightFit.deck; metadata.deckFile = finalWorstTextWeightFit.deckFile; outputFile = finalWorstTextWeightFit.pptxFile; verificationDeck = finalWorstTextWeightFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextWeightFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextWeightFit.deck);
          const validated = validateDeckIr(finalWorstTextWeightFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextWeightFit.quality;
        }
        if (finalWorstTextWeightFit && finalWorstTextWeightFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-weight-fit-accepted": Number(finalWorstTextWeightFit.accepted === true),
              "final-worst-text-weight-fit-text-boxes": finalWorstTextWeightFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalEarlyLightCardStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardStrokeCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalEarlyLightCardStrokeFit?.accepted) {
          validateDeckIr(finalEarlyLightCardStrokeFit.deck, root);
          metadata.generatedDeck = finalEarlyLightCardStrokeFit.deck; metadata.deckFile = finalEarlyLightCardStrokeFit.deckFile; outputFile = finalEarlyLightCardStrokeFit.pptxFile; verificationDeck = finalEarlyLightCardStrokeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalEarlyLightCardStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalEarlyLightCardStrokeFit.deck);
          const validated = validateDeckIr(finalEarlyLightCardStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalEarlyLightCardStrokeFit.quality;
        }
        if (finalEarlyLightCardStrokeFit && finalEarlyLightCardStrokeFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-early-light-card-stroke-fit-accepted": Number(finalEarlyLightCardStrokeFit.accepted === true),
              "final-early-light-card-stroke-fit-shapes": finalEarlyLightCardStrokeFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalSourceVerticalLineFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalSourceVerticalLineCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalSourceVerticalLineFit?.accepted) {
          validateDeckIr(finalSourceVerticalLineFit.deck, root);
          metadata.generatedDeck = finalSourceVerticalLineFit.deck; metadata.deckFile = finalSourceVerticalLineFit.deckFile; outputFile = finalSourceVerticalLineFit.pptxFile; verificationDeck = finalSourceVerticalLineFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalSourceVerticalLineFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalSourceVerticalLineFit.deck);
          const validated = validateDeckIr(finalSourceVerticalLineFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalSourceVerticalLineFit.quality;
        }
        if (finalSourceVerticalLineFit && finalSourceVerticalLineFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-source-vertical-line-fit-accepted": Number(finalSourceVerticalLineFit.accepted === true),
              "final-source-vertical-line-fit-shapes": finalSourceVerticalLineFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLowContrastFooterMarkFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowContrastFooterMarkCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLowContrastFooterMarkFit?.accepted) {
          validateDeckIr(finalLowContrastFooterMarkFit.deck, root);
          metadata.generatedDeck = finalLowContrastFooterMarkFit.deck; metadata.deckFile = finalLowContrastFooterMarkFit.deckFile; outputFile = finalLowContrastFooterMarkFit.pptxFile; verificationDeck = finalLowContrastFooterMarkFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLowContrastFooterMarkFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLowContrastFooterMarkFit.deck);
          const validated = validateDeckIr(finalLowContrastFooterMarkFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLowContrastFooterMarkFit.quality;
        }
        if (finalLowContrastFooterMarkFit && finalLowContrastFooterMarkFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-low-contrast-footer-mark-fit-accepted": Number(finalLowContrastFooterMarkFit.accepted === true),
              "final-low-contrast-footer-mark-fit-shapes": finalLowContrastFooterMarkFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLowContrastFooterPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowContrastFooterPrimitiveCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLowContrastFooterPrimitives?.accepted) {
          validateDeckIr(finalLowContrastFooterPrimitives.deck, root);
          metadata.generatedDeck = finalLowContrastFooterPrimitives.deck; metadata.deckFile = finalLowContrastFooterPrimitives.deckFile; outputFile = finalLowContrastFooterPrimitives.pptxFile; verificationDeck = finalLowContrastFooterPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLowContrastFooterPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLowContrastFooterPrimitives.deck);
          const validated = validateDeckIr(finalLowContrastFooterPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLowContrastFooterPrimitives.quality;
        }
        if (finalLowContrastFooterPrimitives && finalLowContrastFooterPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-low-contrast-footer-primitives-accepted": Number(finalLowContrastFooterPrimitives.accepted === true),
              "final-low-contrast-footer-primitives-shapes": finalLowContrastFooterPrimitives.addedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-editable-text-font-family-fit-accepted"] === undefined && shouldTryFinalEditableTextFontFamilyRefinement(visualQuality)) {
        const finalEditableTextFontFamilyFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalEditableTextFontFamilyCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalEditableTextFontFamilyFit?.accepted) {
          validateDeckIr(finalEditableTextFontFamilyFit.deck, root);
          metadata.generatedDeck = finalEditableTextFontFamilyFit.deck; metadata.deckFile = finalEditableTextFontFamilyFit.deckFile; outputFile = finalEditableTextFontFamilyFit.pptxFile; verificationDeck = finalEditableTextFontFamilyFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalEditableTextFontFamilyFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalEditableTextFontFamilyFit.deck);
          const validated = validateDeckIr(finalEditableTextFontFamilyFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalEditableTextFontFamilyFit.quality;
        }
        if (finalEditableTextFontFamilyFit && finalEditableTextFontFamilyFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-editable-text-font-family-fit-accepted": Number(finalEditableTextFontFamilyFit.accepted === true),
              "final-editable-text-font-family-fit-text-boxes": finalEditableTextFontFamilyFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextColorFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextColorCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextColorFit?.accepted) {
          validateDeckIr(finalWorstTextColorFit.deck, root);
          metadata.generatedDeck = finalWorstTextColorFit.deck; metadata.deckFile = finalWorstTextColorFit.deckFile; outputFile = finalWorstTextColorFit.pptxFile; verificationDeck = finalWorstTextColorFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextColorFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextColorFit.deck);
          const validated = validateDeckIr(finalWorstTextColorFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextColorFit.quality;
        }
        if (finalWorstTextColorFit && finalWorstTextColorFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-color-fit-accepted": Number(finalWorstTextColorFit.accepted === true),
              "final-worst-text-color-fit-text-boxes": finalWorstTextColorFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextArrowGlyphFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextArrowGlyphCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextArrowGlyphFit?.accepted) {
          validateDeckIr(finalWorstTextArrowGlyphFit.deck, root);
          metadata.generatedDeck = finalWorstTextArrowGlyphFit.deck; metadata.deckFile = finalWorstTextArrowGlyphFit.deckFile; outputFile = finalWorstTextArrowGlyphFit.pptxFile; verificationDeck = finalWorstTextArrowGlyphFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextArrowGlyphFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextArrowGlyphFit.deck);
          const validated = validateDeckIr(finalWorstTextArrowGlyphFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextArrowGlyphFit.quality;
        }
        if (finalWorstTextArrowGlyphFit && finalWorstTextArrowGlyphFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-arrow-glyph-fit-accepted": Number(finalWorstTextArrowGlyphFit.accepted === true),
              "final-worst-text-arrow-glyph-fit-text-boxes": finalWorstTextArrowGlyphFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-scale-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextScaleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextScaleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextScaleFit?.accepted) {
          validateDeckIr(finalWorstTextScaleFit.deck, root);
          metadata.generatedDeck = finalWorstTextScaleFit.deck; metadata.deckFile = finalWorstTextScaleFit.deckFile; outputFile = finalWorstTextScaleFit.pptxFile; verificationDeck = finalWorstTextScaleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextScaleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextScaleFit.deck);
          const validated = validateDeckIr(finalWorstTextScaleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextScaleFit.quality;
        }
        if (finalWorstTextScaleFit && finalWorstTextScaleFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-scale-fit-accepted": Number(finalWorstTextScaleFit.accepted === true),
              "final-worst-text-scale-fit-text-boxes": finalWorstTextScaleFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-weight-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextWeightFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextWeightCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextWeightFit?.accepted) {
          validateDeckIr(finalWorstTextWeightFit.deck, root);
          metadata.generatedDeck = finalWorstTextWeightFit.deck; metadata.deckFile = finalWorstTextWeightFit.deckFile; outputFile = finalWorstTextWeightFit.pptxFile; verificationDeck = finalWorstTextWeightFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextWeightFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextWeightFit.deck);
          const validated = validateDeckIr(finalWorstTextWeightFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextWeightFit.quality;
        }
        if (finalWorstTextWeightFit && finalWorstTextWeightFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-weight-fit-accepted": Number(finalWorstTextWeightFit.accepted === true),
              "final-worst-text-weight-fit-text-boxes": finalWorstTextWeightFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextBoxNudgeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextBoxNudgeCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextBoxNudgeFit?.accepted) {
          validateDeckIr(finalWorstTextBoxNudgeFit.deck, root);
          metadata.generatedDeck = finalWorstTextBoxNudgeFit.deck; metadata.deckFile = finalWorstTextBoxNudgeFit.deckFile; outputFile = finalWorstTextBoxNudgeFit.pptxFile; verificationDeck = finalWorstTextBoxNudgeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextBoxNudgeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextBoxNudgeFit.deck);
          const validated = validateDeckIr(finalWorstTextBoxNudgeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextBoxNudgeFit.quality;
        }
        if (finalWorstTextBoxNudgeFit && finalWorstTextBoxNudgeFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-box-nudge-fit-accepted": Number(finalWorstTextBoxNudgeFit.accepted === true),
              "final-worst-text-box-nudge-fit-text-boxes": finalWorstTextBoxNudgeFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextInkBoxFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextInkBoxCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextInkBoxFit?.accepted) {
          validateDeckIr(finalWorstTextInkBoxFit.deck, root);
          metadata.generatedDeck = finalWorstTextInkBoxFit.deck; metadata.deckFile = finalWorstTextInkBoxFit.deckFile; outputFile = finalWorstTextInkBoxFit.pptxFile; verificationDeck = finalWorstTextInkBoxFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextInkBoxFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextInkBoxFit.deck);
          const validated = validateDeckIr(finalWorstTextInkBoxFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextInkBoxFit.quality;
        }
        if (finalWorstTextInkBoxFit && finalWorstTextInkBoxFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-ink-box-fit-accepted": Number(finalWorstTextInkBoxFit.accepted === true),
              "final-worst-text-ink-box-fit-text-boxes": finalWorstTextInkBoxFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalNativeShapeThinStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalNativeShapeThinStrokeCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalNativeShapeThinStrokeFit?.accepted) {
          validateDeckIr(finalNativeShapeThinStrokeFit.deck, root);
          metadata.generatedDeck = finalNativeShapeThinStrokeFit.deck; metadata.deckFile = finalNativeShapeThinStrokeFit.deckFile; outputFile = finalNativeShapeThinStrokeFit.pptxFile; verificationDeck = finalNativeShapeThinStrokeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalNativeShapeThinStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalNativeShapeThinStrokeFit.deck);
          const validated = validateDeckIr(finalNativeShapeThinStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalNativeShapeThinStrokeFit.quality;
        }
        if (finalNativeShapeThinStrokeFit && finalNativeShapeThinStrokeFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-native-shape-thin-stroke-fit-accepted": Number(finalNativeShapeThinStrokeFit.accepted === true),
              "final-native-shape-thin-stroke-fit-shapes": finalNativeShapeThinStrokeFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalShapeSourceProvenanceCompaction = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalShapeSourceProvenanceCompactionCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalShapeSourceProvenanceCompaction?.accepted) {
          validateDeckIr(finalShapeSourceProvenanceCompaction.deck, root);
          metadata.generatedDeck = finalShapeSourceProvenanceCompaction.deck; metadata.deckFile = finalShapeSourceProvenanceCompaction.deckFile; outputFile = finalShapeSourceProvenanceCompaction.pptxFile; verificationDeck = finalShapeSourceProvenanceCompaction.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalShapeSourceProvenanceCompaction.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalShapeSourceProvenanceCompaction.deck);
          const validated = validateDeckIr(finalShapeSourceProvenanceCompaction.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalShapeSourceProvenanceCompaction.quality;
        }
        if (finalShapeSourceProvenanceCompaction && finalShapeSourceProvenanceCompaction.removedFields > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-shape-source-provenance-compaction-accepted": Number(finalShapeSourceProvenanceCompaction.accepted === true),
              "final-shape-source-provenance-compaction-shapes": finalShapeSourceProvenanceCompaction.changedShapes,
              "final-shape-source-provenance-compaction-fields": finalShapeSourceProvenanceCompaction.removedFields
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalTextFidelityPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalTextFidelityPrimitiveCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalTextFidelityPrimitives?.accepted) {
          validateDeckIr(finalTextFidelityPrimitives.deck, root);
          metadata.generatedDeck = finalTextFidelityPrimitives.deck; metadata.deckFile = finalTextFidelityPrimitives.deckFile; outputFile = finalTextFidelityPrimitives.pptxFile; verificationDeck = finalTextFidelityPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalTextFidelityPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalTextFidelityPrimitives.deck);
          const validated = validateDeckIr(finalTextFidelityPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalTextFidelityPrimitives.quality;
        }
        if (finalTextFidelityPrimitives && finalTextFidelityPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-text-fidelity-primitives-accepted": Number(finalTextFidelityPrimitives.accepted === true),
              "final-text-fidelity-primitives-shapes": finalTextFidelityPrimitives.addedShapes,
              "final-text-fidelity-primitives-text-boxes": finalTextFidelityPrimitives.candidateTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardStrokeColorFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardStrokeColorCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardStrokeColorFit?.accepted) {
          validateDeckIr(finalLightCardStrokeColorFit.deck, root);
          metadata.generatedDeck = finalLightCardStrokeColorFit.deck; metadata.deckFile = finalLightCardStrokeColorFit.deckFile; outputFile = finalLightCardStrokeColorFit.pptxFile; verificationDeck = finalLightCardStrokeColorFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardStrokeColorFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardStrokeColorFit.deck);
          const validated = validateDeckIr(finalLightCardStrokeColorFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardStrokeColorFit.quality;
        }
        if (finalLightCardStrokeColorFit && finalLightCardStrokeColorFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-stroke-color-fit-accepted": Number(finalLightCardStrokeColorFit.accepted === true),
              "final-light-card-stroke-color-fit-shapes": finalLightCardStrokeColorFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardSideAccentFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardSideAccentCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardSideAccentFit?.accepted) {
          validateDeckIr(finalLightCardSideAccentFit.deck, root);
          metadata.generatedDeck = finalLightCardSideAccentFit.deck; metadata.deckFile = finalLightCardSideAccentFit.deckFile; outputFile = finalLightCardSideAccentFit.pptxFile; verificationDeck = finalLightCardSideAccentFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardSideAccentFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardSideAccentFit.deck);
          const validated = validateDeckIr(finalLightCardSideAccentFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardSideAccentFit.quality;
        }
        if (finalLightCardSideAccentFit && finalLightCardSideAccentFit.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-side-accent-fit-accepted": Number(finalLightCardSideAccentFit.accepted === true),
              "final-light-card-side-accent-fit-shapes": finalLightCardSideAccentFit.addedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardStrokeCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardStrokeFit?.accepted) {
          validateDeckIr(finalLightCardStrokeFit.deck, root);
          metadata.generatedDeck = finalLightCardStrokeFit.deck; metadata.deckFile = finalLightCardStrokeFit.deckFile; outputFile = finalLightCardStrokeFit.pptxFile; verificationDeck = finalLightCardStrokeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardStrokeFit.deck);
          const validated = validateDeckIr(finalLightCardStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardStrokeFit.quality;
        }
        if (finalLightCardStrokeFit && finalLightCardStrokeFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-stroke-fit-accepted": Number(finalLightCardStrokeFit.accepted === true),
              "final-light-card-stroke-fit-shapes": finalLightCardStrokeFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextColorFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextColorCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextColorFit?.accepted) {
          validateDeckIr(finalWorstTextColorFit.deck, root);
          metadata.generatedDeck = finalWorstTextColorFit.deck; metadata.deckFile = finalWorstTextColorFit.deckFile; outputFile = finalWorstTextColorFit.pptxFile; verificationDeck = finalWorstTextColorFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextColorFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextColorFit.deck);
          const validated = validateDeckIr(finalWorstTextColorFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextColorFit.quality;
        }
        if (finalWorstTextColorFit && finalWorstTextColorFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-color-fit-accepted": Number(finalWorstTextColorFit.accepted === true),
              "final-worst-text-color-fit-text-boxes": finalWorstTextColorFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLateShapeSourceBudgetCompaction = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLateShapeSourceBudgetCompactionCandidate({
          root,
          metadata,
          visualQuality,
          isCancellationRequested
        }));
        if (finalLateShapeSourceBudgetCompaction?.accepted) {
          validateDeckIr(finalLateShapeSourceBudgetCompaction.deck, root);
          metadata.generatedDeck = finalLateShapeSourceBudgetCompaction.deck; metadata.deckFile = finalLateShapeSourceBudgetCompaction.deckFile; verificationDeck = finalLateShapeSourceBudgetCompaction.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateShapeSourceBudgetCompaction.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateShapeSourceBudgetCompaction.deck);
          const validated = validateDeckIr(finalLateShapeSourceBudgetCompaction.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateShapeSourceBudgetCompaction.quality;
        }
        if (finalLateShapeSourceBudgetCompaction && finalLateShapeSourceBudgetCompaction.removedFields > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-shape-source-budget-compaction-accepted": Number(finalLateShapeSourceBudgetCompaction.accepted === true),
              "final-late-shape-source-budget-compaction-shapes": finalLateShapeSourceBudgetCompaction.changedShapes,
              "final-late-shape-source-budget-compaction-fields": finalLateShapeSourceBudgetCompaction.removedFields
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalLateTextSourceBudgetCompaction = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLateTextSourceBudgetCompactionCandidate({
          root,
          metadata,
          visualQuality,
          isCancellationRequested
        }));
        if (finalLateTextSourceBudgetCompaction?.accepted) {
          validateDeckIr(finalLateTextSourceBudgetCompaction.deck, root);
          metadata.generatedDeck = finalLateTextSourceBudgetCompaction.deck; metadata.deckFile = finalLateTextSourceBudgetCompaction.deckFile; verificationDeck = finalLateTextSourceBudgetCompaction.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateTextSourceBudgetCompaction.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateTextSourceBudgetCompaction.deck);
          const validated = validateDeckIr(finalLateTextSourceBudgetCompaction.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateTextSourceBudgetCompaction.quality;
        }
        if (finalLateTextSourceBudgetCompaction && finalLateTextSourceBudgetCompaction.removedFields > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-text-source-budget-compaction-accepted": Number(finalLateTextSourceBudgetCompaction.accepted === true),
              "final-late-text-source-budget-compaction-text-boxes": finalLateTextSourceBudgetCompaction.changedTextBoxes,
              "final-late-text-source-budget-compaction-fields": finalLateTextSourceBudgetCompaction.removedFields
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalComponentFidelityPrimitiveRefinement(visualQuality)) {
        const finalWorstComponentFidelityPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstComponentFidelityPrimitiveCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstComponentFidelityPrimitives?.accepted) {
          validateDeckIr(finalWorstComponentFidelityPrimitives.deck, root);
          metadata.generatedDeck = finalWorstComponentFidelityPrimitives.deck; metadata.deckFile = finalWorstComponentFidelityPrimitives.deckFile; outputFile = finalWorstComponentFidelityPrimitives.pptxFile; verificationDeck = finalWorstComponentFidelityPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstComponentFidelityPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstComponentFidelityPrimitives.deck);
          const validated = validateDeckIr(finalWorstComponentFidelityPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstComponentFidelityPrimitives.quality;
        }
        if (finalWorstComponentFidelityPrimitives && finalWorstComponentFidelityPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-component-fidelity-primitives-accepted": Number(finalWorstComponentFidelityPrimitives.accepted === true),
              "final-worst-component-fidelity-primitives-shapes": finalWorstComponentFidelityPrimitives.addedShapes,
              "final-worst-component-fidelity-primitives-components": finalWorstComponentFidelityPrimitives.candidateComponents
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalLateTextFidelityPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalTextFidelityPrimitiveCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateTextFidelityPrimitives?.accepted) {
          validateDeckIr(finalLateTextFidelityPrimitives.deck, root);
          metadata.generatedDeck = finalLateTextFidelityPrimitives.deck; metadata.deckFile = finalLateTextFidelityPrimitives.deckFile; outputFile = finalLateTextFidelityPrimitives.pptxFile; verificationDeck = finalLateTextFidelityPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateTextFidelityPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateTextFidelityPrimitives.deck);
          const validated = validateDeckIr(finalLateTextFidelityPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateTextFidelityPrimitives.quality;
        }
        if (finalLateTextFidelityPrimitives && finalLateTextFidelityPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-text-fidelity-primitives-accepted": Number(finalLateTextFidelityPrimitives.accepted === true),
              "final-late-text-fidelity-primitives-shapes": finalLateTextFidelityPrimitives.addedShapes,
              "final-late-text-fidelity-primitives-text-boxes": finalLateTextFidelityPrimitives.candidateTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalLateArrowTextFidelity = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateArrowTextFidelity?.accepted) {
          validateDeckIr(finalLateArrowTextFidelity.deck, root);
          metadata.generatedDeck = finalLateArrowTextFidelity.deck; metadata.deckFile = finalLateArrowTextFidelity.deckFile; outputFile = finalLateArrowTextFidelity.pptxFile; verificationDeck = finalLateArrowTextFidelity.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateArrowTextFidelity.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateArrowTextFidelity.deck);
          const validated = validateDeckIr(finalLateArrowTextFidelity.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateArrowTextFidelity.quality;
        }
        if (finalLateArrowTextFidelity && (finalLateArrowTextFidelity.changedTextBoxes > 0 || finalLateArrowTextFidelity.addedShapes > 0)) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-arrow-text-fidelity-accepted": Number(finalLateArrowTextFidelity.accepted === true),
              "final-late-arrow-text-fidelity-text-boxes": finalLateArrowTextFidelity.changedTextBoxes,
              "final-late-arrow-text-fidelity-shapes": finalLateArrowTextFidelity.addedShapes,
              "final-late-arrow-text-fidelity-primitive-text-boxes": finalLateArrowTextFidelity.candidateTextBoxesWithPrimitives
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLateLowContrastFooterMarkFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowContrastFooterMarkCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateLowContrastFooterMarkFit?.accepted) {
          validateDeckIr(finalLateLowContrastFooterMarkFit.deck, root);
          metadata.generatedDeck = finalLateLowContrastFooterMarkFit.deck; metadata.deckFile = finalLateLowContrastFooterMarkFit.deckFile; outputFile = finalLateLowContrastFooterMarkFit.pptxFile; verificationDeck = finalLateLowContrastFooterMarkFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateLowContrastFooterMarkFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateLowContrastFooterMarkFit.deck);
          const validated = validateDeckIr(finalLateLowContrastFooterMarkFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateLowContrastFooterMarkFit.quality;
        }
        if (finalLateLowContrastFooterMarkFit && finalLateLowContrastFooterMarkFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-low-contrast-footer-mark-fit-accepted": Number(finalLateLowContrastFooterMarkFit.accepted === true),
              "final-late-low-contrast-footer-mark-fit-shapes": finalLateLowContrastFooterMarkFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalWorstConnectorStyleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstConnectorStyleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstConnectorStyleFit?.accepted) {
          validateDeckIr(finalWorstConnectorStyleFit.deck, root);
          metadata.generatedDeck = finalWorstConnectorStyleFit.deck; metadata.deckFile = finalWorstConnectorStyleFit.deckFile; outputFile = finalWorstConnectorStyleFit.pptxFile; verificationDeck = finalWorstConnectorStyleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstConnectorStyleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstConnectorStyleFit.deck);
          const validated = validateDeckIr(finalWorstConnectorStyleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstConnectorStyleFit.quality;
        }
        if (finalWorstConnectorStyleFit && finalWorstConnectorStyleFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-connector-style-fit-accepted": Number(finalWorstConnectorStyleFit.accepted === true),
              "final-worst-connector-style-fit-shapes": finalWorstConnectorStyleFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality) && visualQuality?.metrics?.["final-light-card-geometry-fit-shapes"] === undefined) {
        const finalLateLightCardGeometryFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardGeometryCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateLightCardGeometryFit?.accepted) {
          validateDeckIr(finalLateLightCardGeometryFit.deck, root);
          metadata.generatedDeck = finalLateLightCardGeometryFit.deck; metadata.deckFile = finalLateLightCardGeometryFit.deckFile; outputFile = finalLateLightCardGeometryFit.pptxFile; verificationDeck = finalLateLightCardGeometryFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateLightCardGeometryFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateLightCardGeometryFit.deck);
          const validated = validateDeckIr(finalLateLightCardGeometryFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateLightCardGeometryFit.quality;
        }
        if (finalLateLightCardGeometryFit && finalLateLightCardGeometryFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-light-card-geometry-fit-accepted": Number(finalLateLightCardGeometryFit.accepted === true),
              "final-late-light-card-geometry-fit-shapes": finalLateLightCardGeometryFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && !largeRasterEditability(verificationDeck).passed) {
        const finalLineTextCoveredCropDrop = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLineTextCoveredCropDropCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLineTextCoveredCropDrop?.accepted) {
          validateDeckIr(finalLineTextCoveredCropDrop.deck, root);
          metadata.generatedDeck = finalLineTextCoveredCropDrop.deck; metadata.deckFile = finalLineTextCoveredCropDrop.deckFile; outputFile = finalLineTextCoveredCropDrop.pptxFile; verificationDeck = finalLineTextCoveredCropDrop.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLineTextCoveredCropDrop.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLineTextCoveredCropDrop.deck);
          const validated = validateDeckIr(finalLineTextCoveredCropDrop.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = {
            ...finalLineTextCoveredCropDrop.quality,
            metrics: {
              ...finalLineTextCoveredCropDrop.quality.metrics,
              "final-line-text-covered-crop-drop-accepted": 1,
              "final-line-text-covered-crop-drop-removed": finalLineTextCoveredCropDrop.removedImages,
              "final-line-text-covered-crop-drop-large-raster-count": finalLineTextCoveredCropDrop.candidateRaster.largeRasterCount
            }
          };
        } else if (finalLineTextCoveredCropDrop && finalLineTextCoveredCropDrop.removedImages > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-line-text-covered-crop-drop-accepted": 0,
              "final-line-text-covered-crop-drop-removed": finalLineTextCoveredCropDrop.removedImages,
              ...(finalLineTextCoveredCropDrop.rejectionCode ? { "final-line-text-covered-crop-drop-rejection-code": finalLineTextCoveredCropDrop.rejectionCode } : {})
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && !largeRasterEditability(verificationDeck).passed) {
        let nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => nativeShadowSession.resume({ root,
          baselineDeck: metadata.generatedDeck, baselineQuality: visualQuality, sourceImages: metadata.normalizedSourceImages,
          policy: nativeShadowPolicy }));
        const resumedNativeShadow = nativeOnlyCandidate !== null;
        if (!resumedNativeShadow) {
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildNativeOnlyResidualCandidate({
            root, metadata, outputFile, rawImageQualityVerifier, sourceImages: metadata.normalizedSourceImages, isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => refineNativeOnlyResidualCandidateText({
            nativeOnlyCandidate,
            root,
            rawImageTextRefiner,
            rawImageOwnedTextRefiner,
            sourceImages: metadata.normalizedSourceImages,
            rawImageQualityVerifier,
            isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => refineNativeOnlyResidualCandidateMissingNativeLines({
            nativeOnlyCandidate,
            root,
            sourceImages: metadata.normalizedSourceImages,
            rawImageQualityVerifier,
            isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => searchProvisionalNativeCandidate({
            root, candidate: nativeOnlyCandidate, baselineQuality: visualQuality, baselineDeck: verificationDeck, refineOwnedTexts: rawImageOwnedTextRefiner, refineNativeStrokes: refineNativeOnlyStrokes,
            sourceImages: metadata.normalizedSourceImages, rawImageQualityVerifier, isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
        }
        if (resumedNativeShadow) visualQuality = { ...visualQuality, metrics: { ...visualQuality.metrics, "native-shadow-resumed": 1 } };
        const nativeOnlyPolicy = nativeOnlyCandidate?.rejected === true ? null : assessStrictNativeCandidate({
          baselineQuality: visualQuality,
          baselineDeck: verificationDeck,
          candidateQuality: nativeOnlyCandidate?.quality,
          candidateDeck: nativeOnlyCandidate?.deck
        });
        const nativeOnlyQualityAcceptable = nativeOnlyCandidate && nativeOnlyResidualQualityAcceptable({
          baselineQuality: visualQuality,
          candidateQuality: nativeOnlyCandidate.quality,
          baselineDeck: verificationDeck,
          candidateDeck: nativeOnlyCandidate.deck
        }) && nativeOnlyPolicy?.passed === true;
        if (nativeOnlyQualityAcceptable) {
          adoptNativeOnlyResidualCandidate({ metadata, nativeOnlyCandidate, root });
          outputFile = nativeOnlyCandidate.pptxFile; verificationDeck = nativeOnlyCandidate.deck;
          visualQuality = {
            ...nativeOnlyCandidate.quality,
            metrics: {
              ...nativeOnlyCandidate.quality.metrics,
              "final-native-only-residual-removed": nativeOnlyCandidate.removed,
              "final-native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
          visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(visualQuality);
          let finalNativeOnlyCardStrokeFit = null;
          let finalNativeOnlyCardStrokeShapes = 0;
          let finalNativeOnlyCardStrokeIterations = 0;
          for (let sourceStrokeIteration = 0; sourceStrokeIteration < 3; sourceStrokeIteration += 1) {
            finalNativeOnlyCardStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardSourceStrokeCandidate({
              root,
              metadata,
              sourceImages: metadata.normalizedSourceImages,
              visualQuality,
              rawImageQualityVerifier,
              isCancellationRequested,
              candidateLimits: [1],
              runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
            }));
            if (!finalNativeOnlyCardStrokeFit?.accepted) break;
            validateDeckIr(finalNativeOnlyCardStrokeFit.deck, root);
            metadata.generatedDeck = finalNativeOnlyCardStrokeFit.deck; metadata.deckFile = finalNativeOnlyCardStrokeFit.deckFile; outputFile = finalNativeOnlyCardStrokeFit.pptxFile; verificationDeck = finalNativeOnlyCardStrokeFit.deck;
            metadata.nativeMetrics = nativeObjectMetrics(finalNativeOnlyCardStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalNativeOnlyCardStrokeFit.deck);
            const validated = validateDeckIr(finalNativeOnlyCardStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
            finalNativeOnlyCardStrokeShapes += finalNativeOnlyCardStrokeFit.changedShapes;
            finalNativeOnlyCardStrokeIterations += 1;
            visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(finalNativeOnlyCardStrokeFit.quality);
          }
          if (finalNativeOnlyCardStrokeShapes > 0) {
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "final-native-only-light-card-source-stroke-accepted": 1,
                "final-native-only-light-card-source-stroke-shapes": finalNativeOnlyCardStrokeShapes,
                "final-native-only-light-card-source-stroke-iterations": finalNativeOnlyCardStrokeIterations
              }
            };
          } else if (finalNativeOnlyCardStrokeFit && finalNativeOnlyCardStrokeFit.changedShapes > 0) {
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "final-native-only-light-card-source-stroke-accepted": 0,
                "final-native-only-light-card-source-stroke-shapes": finalNativeOnlyCardStrokeFit.changedShapes
              }
            };
          }
          const finalNativeOnlySaturatedColorPanelFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalSaturatedColorPanelCandidate({
            root,
            metadata,
            sourceImages: metadata.normalizedSourceImages,
            visualQuality,
            rawImageQualityVerifier,
            isCancellationRequested,
            candidateLimits: [1, 2, 3],
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          if (finalNativeOnlySaturatedColorPanelFit?.accepted) {
            validateDeckIr(finalNativeOnlySaturatedColorPanelFit.deck, root);
            metadata.generatedDeck = finalNativeOnlySaturatedColorPanelFit.deck; metadata.deckFile = finalNativeOnlySaturatedColorPanelFit.deckFile; outputFile = finalNativeOnlySaturatedColorPanelFit.pptxFile; verificationDeck = finalNativeOnlySaturatedColorPanelFit.deck;
            metadata.nativeMetrics = nativeObjectMetrics(finalNativeOnlySaturatedColorPanelFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalNativeOnlySaturatedColorPanelFit.deck);
            const validated = validateDeckIr(finalNativeOnlySaturatedColorPanelFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
            visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap({
              ...finalNativeOnlySaturatedColorPanelFit.quality,
              metrics: {
                ...visualQuality.metrics,
                ...finalNativeOnlySaturatedColorPanelFit.quality.metrics,
                "final-native-only-saturated-color-panel-fit-accepted": 1,
                "final-native-only-saturated-color-panel-fit-shapes": finalNativeOnlySaturatedColorPanelFit.changedShapes
              }
            });
          } else if (finalNativeOnlySaturatedColorPanelFit && finalNativeOnlySaturatedColorPanelFit.changedShapes > 0) {
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "final-native-only-saturated-color-panel-fit-accepted": 0,
                "final-native-only-saturated-color-panel-fit-shapes": finalNativeOnlySaturatedColorPanelFit.changedShapes
              }
            };
          }
        } else if (nativeOnlyCandidate) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-native-only-residual-rejected": 1,
              ...(nativeOnlyCandidate.rejected === true ? { "final-native-only-residual-rejection-code": nativeOnlyCandidate.rejectionCode } : {}),
              ...(nativeOnlyPolicy && nativeOnlyPolicy.passed !== true ? { "final-native-only-residual-policy-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("semantic-editability") ? { "final-native-only-residual-semantic-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("native-component-quality") ? { "final-native-only-residual-component-rejected": 1 } : {}),
              ...nativeOnlyResidualRejectionMetrics(nativeOnlyCandidate, nativeOnlyPolicy, "final-native-only-residual"),
              "final-native-only-residual-removed": nativeOnlyCandidate.removed,
              "final-native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === undefined
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalMissingNativeVisualAtomFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalMissingNativeVisualAtomCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalMissingNativeVisualAtomFit?.accepted) {
          validateDeckIr(finalMissingNativeVisualAtomFit.deck, root);
          metadata.generatedDeck = finalMissingNativeVisualAtomFit.deck; metadata.deckFile = finalMissingNativeVisualAtomFit.deckFile; outputFile = finalMissingNativeVisualAtomFit.pptxFile; verificationDeck = finalMissingNativeVisualAtomFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalMissingNativeVisualAtomFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalMissingNativeVisualAtomFit.deck);
          const validated = validateDeckIr(finalMissingNativeVisualAtomFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = {
            ...finalMissingNativeVisualAtomFit.quality,
            metrics: {
              ...finalMissingNativeVisualAtomFit.quality.metrics,
              "final-missing-native-visual-atom-fit-accepted": 1,
              "final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit.addedShapes,
              "final-missing-native-visual-atom-fit-targets": finalMissingNativeVisualAtomFit.candidateTargets,
              "final-missing-native-visual-atom-fit-atoms": finalMissingNativeVisualAtomFit.candidateAtoms
            }
          };
        } else if (finalMissingNativeVisualAtomFit) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-missing-native-visual-atom-fit-accepted": 0,
              "final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit.addedShapes || 0,
              "final-missing-native-visual-atom-fit-targets": finalMissingNativeVisualAtomFit.candidateTargets || 0,
              "final-missing-native-visual-atom-fit-atoms": finalMissingNativeVisualAtomFit.candidateAtoms || 0
            }
          };
        }
      }
      if (raw && rawImageTypographyRefiner && rawImageQualityVerifier && qualityRendered(visualQuality)) {
        const typography = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTypographyRefiner({
          root, deck: verificationDeck, deckFile: metadata.deckFile, pptxFile: outputFile, initialQuality: visualQuality, isCancellationRequested,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages, deck, isCancellationRequested })
        }));
        metadata.typographySearchFile = typography.searchFile;
        if (typography.accepted) {
          const validated = validateDeckIr(typography.deck, root);
          metadata.generatedDeck = typography.deck; metadata.deckFile = typography.deckFile; verificationDeck = typography.deck; outputFile = typography.pptxFile;
          metadata.nativeMetrics = nativeObjectMetrics(typography.deck); metadata.nativeComponentQuality = auditNativeComponentQuality(typography.deck);
          metadata.pages = validated.pages; metadata.assets = validated.assets; visualQuality = typography.quality;
        }
      }
      const rasterEditability = largeRasterEditability(verificationDeck);
      const semanticEditability = raw ? auditSemanticEditability(verificationDeck) : null;
      if (semanticEditability) metadata.semanticEditability = semanticEditability;
      const sourceCheck = metadata.kind === "raw-document" ? "document-pages-normalized" : metadata.kind === "raw-image" ? (metadata.pages > 1 ? "raw-image-batch-validated" : "raw-image-validated") : "deck-ir-validated";
      const checks = [{ name: sourceCheck, passed: true }, { name: "assets-resolved", passed: true }];
      if (raw) checks.push(
        { name: "native-graphics-rebuilt", passed: metadata.nativeGraphicsRebuilt === true },
        ...(metadata.nativeComponentQuality ? [{ name: "native-component-quality", passed: metadata.nativeComponentQuality.passed }] : []),
        ...(semanticEditability ? [{ name: "semantic-editability", passed: semanticEditability.passed }] : []),
        ...(requiredReconstructionProfile ? [{ name: "local-production-profile-aligned", passed: metadata.reconstructionProfile === requiredReconstructionProfile }] : []),
        ...(metadata.residualDeduplication?.required ? [{ name: "residual-native-duplicates-removed", passed: metadata.residualDeduplication.passed }] : []),
        ...(visualQuality?.checks || [{ name: "quality-render-not-configured", passed: false }])
      );
      if (!raw && visualVerificationEnabled) checks.push(...(visualQuality?.checks || [{ name: "quality-render-not-configured", passed: false }]));
      if (!raw && visualVerificationEnabled) for (const name of ["quality-rendered", "visual-fidelity"]) {
        if (!checks.some(check => check.name === name)) checks.push({ name, passed: false });
      }
      if (!rasterEditability.passed) checks.push({ name: "large-raster-editability", passed: false });
      checks.push({ name: "pptx-generated", passed: true });
      let delivered = null;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (createDelivery) {
        delivered = await runWorkerStage("IMAGE_DELIVERY_FAILED", () => createDelivery({ root, irFile: metadata.deckFile, pptxFile: outputFile, isCancellationRequested,
          ...(metadata.typographySearchFile ? { typographySearchFile: metadata.typographySearchFile } : {}) }));
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (delivered && (!Array.isArray(delivered.artifacts) || !Array.isArray(delivered.checks))) throw new Error("editable delivery adapter returned an invalid result");
      if (delivered) checks.push(...delivered.checks);
      if (!delivered && path.dirname(outputFile) !== root) {
        const stagedOutputFile = path.join(root, "deck.pptx");
        fs.copyFileSync(outputFile, stagedOutputFile);
        outputFile = stagedOutputFile;
      }
      const qualityMetrics = trimQualityMetrics({ pages: metadata.pages, "referenced-assets": metadata.assets, "large-raster-count": rasterEditability.largeRasterCount, "largest-raster-area-ratio": rasterEditability.largestAreaRatio, ...(raw ? { "native-shapes": metadata.nativeMetrics?.shapes || 0, "native-connectors": metadata.nativeMetrics?.connectors || 0, "native-text-boxes": metadata.nativeMetrics?.textBoxes || 0, "native-tables": metadata.nativeMetrics?.tables || 0, "native-charts": metadata.nativeMetrics?.charts || 0, "residual-images": metadata.nativeMetrics?.images || 0, "residual-erased-native-objects": metadata.residualDeduplication?.erasedObjects || 0, ...(metadata.nativeComponentQuality ? { "component-quality-connectors": metadata.nativeComponentQuality.connectors, "component-quality-minimum-unit-crops": metadata.nativeComponentQuality.minimumUnitCrops, "component-quality-evidenced-crops": metadata.nativeComponentQuality.evidencedMinimumUnitCrops, "component-quality-unverified-crops": metadata.nativeComponentQuality.unverifiedMinimumUnitCrops, "component-quality-ignored-pixel-primitives": metadata.nativeComponentQuality.ignoredPixelPrimitives || 0 } : {}), ...(metadata.semanticEditability ? { "semantic-raster-derived-primitives": metadata.semanticEditability.metrics.rasterDerivedPrimitiveCount, "semantic-large-raster-lineages": metadata.semanticEditability.metrics.largeRasterLineageCount, "semantic-unverified-crops": metadata.semanticEditability.metrics.unverifiedCropCount, "semantic-raster-provenance-missing": metadata.semanticEditability.metrics.missingRasterProvenanceCount, "semantic-suspicious-raster-mosaic": metadata.semanticEditability.metrics.suspiciousMosaicCount } : {}), ...(requiredReconstructionProfile ? { "production-profile-aligned": metadata.reconstructionProfile === requiredReconstructionProfile ? 1 : 0 } : {}), ...(metadata.visualFallbackRejections || {}), ...(visualQuality?.metrics || {}), "ocr-crop-lines-recovered": deliveredOcrCropRecovery?.recovered || 0 } : {}), ...(!raw && visualVerificationEnabled ? (visualQuality?.metrics || {}) : {}), "pptx-bytes": fs.statSync(outputFile).size });
      const quality = assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: qualityMetrics });
      const outputArtifacts = prepareDeliveryArtifacts(delivered?.artifacts || [{ name: "deck.pptx", file: outputFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }], root);
      const artifacts = [];
      for (const item of outputArtifacts) {
        if (await isCancellationRequested()) throw new Error("editable job was cancelled");
        const artifactBody = readDeliveryArtifact(item, root); const objectKey = `${job.outputPrefix}${item.name}`;
        await runWorkerStage("IMAGE_UPLOAD_FAILED", () => store.putObject({ objectKey, body: artifactBody, contentType: item.mediaType }));
        artifacts.push({ name: item.name, objectKey, mediaType: item.mediaType, sha256: sha256(artifactBody) });
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      return { completionPolicy: QUALITY_GATE_REQUIRED, artifacts, quality };
    } finally {
      try { nativeShadowSession.close(); }
      finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
    }
  }, { timeoutMs, temporaryRoot });
}

module.exports = { IMAGE_EXTENSIONS, MAX_DECK_BYTES, addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalPrimitiveCandidate, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, readRawImageDimensions, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, safeAssetPath, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalMissingNativeVisualAtomCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, validateDocumentPackage, validatePackage, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates };
module.exports.missingNativeVisualAtomLineBundles = missingNativeVisualAtomLineBundles;
module.exports.tryBuildFinalWorstTextWeightCandidate = tryBuildFinalWorstTextWeightCandidate;
module.exports.tryBuildFinalEditableTextFontFamilyCandidate = tryBuildFinalEditableTextFontFamilyCandidate;
module.exports.tryBuildFinalWorstTextScaleCandidate = tryBuildFinalWorstTextScaleCandidate;
module.exports.tryBuildFinalLowSaturationPanelFillCandidate = tryBuildFinalLowSaturationPanelFillCandidate;
module.exports.refineNativeOnlyStrokes = refineNativeOnlyStrokes;
module.exports.shouldTryFinalWorstTextRefinement = shouldTryFinalWorstTextRefinement;
