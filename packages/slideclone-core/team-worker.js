"use strict";

const { safeAssetPath, validateDeckIr, admitRebuiltPage } = require("./deck-ir-admission");

const { admitTemplateBuild } = require("./template-build-admission");
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES, prepareDeliveryArtifacts, readDeliveryArtifact } = require("./delivery-artifacts");
const { run: runProcess } = require("./renderer-process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MAX_ARCHIVE_BYTES, extractProjectArchive } = require("../project-audit-core/team-worker");
const { assertQualityReport } = require("../capability-contracts");
const { nativeObjectMetrics } = require("./team-native-rebuild");
const { assertEditableInputDocument } = require("./document-input");
const { QUALITY_GATE_REQUIRED } = require("../team-runtime/worker-completion");
const { WorkerFailure, runWorkerStage } = require("../team-runtime/worker-failure");
const { createOcrCheckpoint } = require("./ocr-checkpoint");
const { admitOcrResult } = require("./ocr-result-admission");
const { admitRebuiltPageMetadata } = require("./rebuilt-page-metadata");
const { admitNormalizedPages } = require("./normalized-pages-admission");

const { createArchiveAdmission, IMAGE_EXTENSIONS, MAX_DECK_BYTES } = require("./archive-admission");
const { validatePackage, validateDocumentPackage, readRawImageDimensions } = createArchiveAdmission(assertEditableInputDocument);

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
  return rewrite(deck);
}
async function rebuildRawImages({ root, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job }) {
  const pageDecks = []; const sourceImages = []; const reconstructionProfiles = []; const componentQuality = [];
  let slideSize; let candidateObjects = 0; let erasedObjects = 0;
  for (const source of metadata.sources) {
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const pageRoot = path.join(root, ".raw-pages", String(source.pageIndex + 1).padStart(3, "0"));
    fs.mkdirSync(path.join(pageRoot, "assets"), { recursive: true });
    fs.copyFileSync(source.inputFile, path.join(pageRoot, ...source.assetPath.split("/")));
    const runOcr = () => rawImageOcr({ inputFile: source.inputFile, dimensions: source.dimensions, pageIndex: source.pageIndex, isCancellationRequested });
    const ocr = await runWorkerStage("IMAGE_OCR_FAILED", async () => admitOcrResult(await (ocrCheckpoint ? ocrCheckpoint({ job, source, runOcr, isCancellationRequested }) : runOcr()), source.dimensions));
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const rebuilt = await runWorkerStage("IMAGE_REBUILD_FAILED", () => rawImageRebuilder({ root: pageRoot, metadata: source, ocr, pageIndex: source.pageIndex, isCancellationRequested }));
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
  }
  const distinctProfiles = new Set(reconstructionProfiles);
  const reconstructionProfile = distinctProfiles.size === 1 && reconstructionProfiles[0] !== null ? reconstructionProfiles[0] : null;
  const deck = { version: "1.0", meta: { source: "team-raw-image-batch", reconstructionMode: "native-hybrid", reconstructionProfile, sourceCount: metadata.sources.length }, slideSize, pages: pageDecks };
  const nativeComponentQuality = componentQuality.length === 0 ? null : {
    passed: componentQuality.length === metadata.sources.length && componentQuality.every((item) => item.passed),
    pagesAudited: componentQuality.length,
    connectors: componentQuality.reduce((sum, item) => sum + (item.metrics?.connectors || 0), 0),
    minimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.minimumUnitCrops || 0), 0),
    evidencedMinimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.evidencedMinimumUnitCrops || 0), 0),
    unverifiedMinimumUnitCrops: componentQuality.reduce((sum, item) => sum + (item.metrics?.unverifiedMinimumUnitCrops || 0), 0),
  };
  return { deck, sourceImages, residual: { candidateObjects, erasedObjects }, reconstructionProfile, nativeComponentQuality };
}
async function runBuilder({ executable, builderArgs = [], deckFile, outputFile, cwd, timeoutMs, isCancellationRequested }) {
  if (typeof executable !== "string" || !path.isAbsolute(executable)) throw new Error("OpenXML builder executable is invalid");
  if (!Array.isArray(builderArgs) || builderArgs.some((arg) => typeof arg !== "string" || !arg)) throw new TypeError("OpenXML builder arguments are invalid");
  if (await isCancellationRequested()) throw new Error("editable job was cancelled");
  await admitTemplateBuild({executable, builderArgs, deckFile, cwd, timeoutMs, isCancellationRequested});
  await runProcess(executable, [...builderArgs, "--ir", deckFile, "--out", outputFile, "--powerpoint-safe", "true"], { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024, isCancellationRequested });
}
function createImageToEditableArchiveHandler({ objectStore, temporaryRoot = os.tmpdir(), builderExecutable = process.env.OPENXML_BUILDER_EXE || "/opt/openxml/OpenXmlDeckBuilder", builderArgs = [], documentNormalizer, rawImageOcr, rawImageRebuilder, rawImageQualityVerifier, rawImageTextRefiner, createDelivery, requiredReconstructionProfile, ocrCheckpointFingerprint, timeoutMs = 8 * 60 * 1000 } = {}) {
  const store = assertObjectStore(objectStore);
  const ocrCheckpoint = ocrCheckpointFingerprint === undefined ? undefined : createOcrCheckpoint({ objectStore: store, profileFingerprint: ocrCheckpointFingerprint });
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 9 * 60 * 1000) throw new RangeError("editable worker timeout is invalid");
  if (documentNormalizer !== undefined && typeof documentNormalizer !== "function") throw new TypeError("documentNormalizer must be a function");
  if (rawImageQualityVerifier !== undefined && typeof rawImageQualityVerifier !== "function") throw new TypeError("rawImageQualityVerifier must be a function");
  if (rawImageTextRefiner !== undefined && typeof rawImageTextRefiner !== "function") throw new TypeError("rawImageTextRefiner must be a function");
  if (createDelivery !== undefined && typeof createDelivery !== "function") throw new TypeError("createDelivery must be a function");
  if (requiredReconstructionProfile !== undefined && (typeof requiredReconstructionProfile !== "string" || !/^[a-z0-9][a-z0-9.-]{2,63}$/u.test(requiredReconstructionProfile))) throw new TypeError("required reconstruction profile is invalid");
  return async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "image-to-editable" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("editable worker job is invalid");
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const archive = await runWorkerStage("IMAGE_INPUT_READ_FAILED", () => store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES }));
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-editable-"));
    try {
      extractProjectArchive(archive, root, { label: "editable" });
      const metadata = validatePackage(root);
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (metadata.kind === "raw-document") {
        if (typeof documentNormalizer !== "function") throw new Error("document editable normalization profile is not enabled for this worker");
        const normalized = await runWorkerStage("IMAGE_NORMALIZATION_FAILED", async () => admitNormalizedPages(await documentNormalizer({ root, metadata, isCancellationRequested }), root));
        metadata.sources = normalized.sources; metadata.pages = normalized.pages; metadata.assets = normalized.assets;
      }
      if (metadata.kind === "raw-image" || metadata.kind === "raw-document") {
        if (typeof rawImageOcr !== "function") throw new Error("raw editable image profile is not enabled for this worker");
        if (typeof rawImageRebuilder !== "function") throw new Error("raw editable native rebuild profile is not enabled for this worker");
        const rebuilt = await rebuildRawImages({ root, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job });
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
        metadata.generatedDeck = generatedDeck;
      }
      let outputFile = path.join(root, createDelivery ? "source.pptx" : "deck.pptx");
      await runWorkerStage("IMAGE_BUILD_FAILED", () => runBuilder({ executable: builderExecutable, builderArgs, deckFile: metadata.deckFile, outputFile, cwd: root, timeoutMs, isCancellationRequested }));
      if (!fs.existsSync(outputFile) || !fs.statSync(outputFile).isFile() || fs.statSync(outputFile).size < 1 || fs.statSync(outputFile).size > MAX_PPTX_BYTES) throw new Error("editable builder produced an invalid artifact");
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const raw = metadata.kind === "raw-image" || metadata.kind === "raw-document";
      const sourceImages = raw ? metadata.normalizedSourceImages : metadata.structuredSourceImages;
      const visualVerificationEnabled = Array.isArray(sourceImages);
      const verificationDeck = raw ? metadata.generatedDeck : metadata.structuredDeck;
      let renderedImages = [];
      let visualQuality = visualVerificationEnabled && rawImageQualityVerifier
        ? await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageQualityVerifier({ root, pptxFile: outputFile, sourceImage: sourceImages[0], sourceImages, deck: verificationDeck, isCancellationRequested, collectRenderedPages: pages => { renderedImages = pages; } }))
        : null;
      if (raw && rawImageQualityVerifier && rawImageTextRefiner && renderedImages.length && visualQuality?.checks?.some(check => check.name === "quality-rendered" && check.passed === true)) {
        const refinementStartedAt = Date.now();
        const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
          root, deckFile: metadata.deckFile, pptxFile: outputFile, deck: metadata.generatedDeck,
          sourceImages: metadata.normalizedSourceImages, renderedImages, initialQuality: visualQuality, isCancellationRequested,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages: metadata.normalizedSourceImages, deck, isCancellationRequested })
        }));
        if (!refined || typeof refined.accepted !== "boolean" || !Number.isSafeInteger(refined.skippedPixelBudget)
          || refined.skippedPixelBudget < 0 || refined.skippedPixelBudget > 1_600_000_000) throw new Error("text refinement returned an invalid result");
        if (refined.accepted) {
          validateDeckIr(refined.deck, root);
          metadata.generatedDeck = refined.deck; metadata.deckFile = refined.deckFile; outputFile = refined.pptxFile; visualQuality = refined.quality;
        }
        visualQuality = { ...visualQuality, metrics: { ...visualQuality.metrics, "text-refinement-accepted": Number(refined.accepted), "text-refinement-proposed-boxes": refined.changedTextBoxes, "text-refinement-milliseconds": Date.now() - refinementStartedAt, ...(refined.skippedPixelBudget ? {"text-refinement-skipped-pixel-budget": refined.skippedPixelBudget} : {}) } };
      }
      const sourceCheck = metadata.kind === "raw-document" ? "document-pages-normalized" : metadata.kind === "raw-image" ? (metadata.pages > 1 ? "raw-image-batch-validated" : "raw-image-validated") : "deck-ir-validated";
      const checks = [{ name: sourceCheck, passed: true }, { name: "assets-resolved", passed: true }];
      if (raw) checks.push(
        { name: "native-graphics-rebuilt", passed: metadata.nativeGraphicsRebuilt === true },
        ...(metadata.nativeComponentQuality ? [{ name: "native-component-quality", passed: metadata.nativeComponentQuality.passed }] : []),
        ...(requiredReconstructionProfile ? [{ name: "local-production-profile-aligned", passed: metadata.reconstructionProfile === requiredReconstructionProfile }] : []),
        ...(metadata.residualDeduplication?.required ? [{ name: "residual-native-duplicates-removed", passed: metadata.residualDeduplication.passed }] : []),
        ...(visualQuality?.checks || [{ name: "quality-render-not-configured", passed: false }])
      );
      if (!raw && visualVerificationEnabled) checks.push(...(visualQuality?.checks || [{ name: "quality-render-not-configured", passed: false }]));
      if (!raw && visualVerificationEnabled) for (const name of ["quality-rendered", "visual-fidelity"]) {
        if (!checks.some(check => check.name === name)) checks.push({ name, passed: false });
      }
      checks.push({ name: "pptx-generated", passed: true });
      let delivered = null;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (createDelivery) {
        delivered = await runWorkerStage("IMAGE_DELIVERY_FAILED", () => createDelivery({ root, irFile: metadata.deckFile, pptxFile: outputFile, isCancellationRequested }));
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (delivered && (!Array.isArray(delivered.artifacts) || !Array.isArray(delivered.checks))) throw new Error("editable delivery adapter returned an invalid result");
      if (delivered) checks.push(...delivered.checks);
      const quality = assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: { pages: metadata.pages, "referenced-assets": metadata.assets, ...(raw ? { "native-shapes": metadata.nativeMetrics?.shapes || 0, "native-connectors": metadata.nativeMetrics?.connectors || 0, "native-text-boxes": metadata.nativeMetrics?.textBoxes || 0, "native-tables": metadata.nativeMetrics?.tables || 0, "native-charts": metadata.nativeMetrics?.charts || 0, "residual-images": metadata.nativeMetrics?.images || 0, "residual-erased-native-objects": metadata.residualDeduplication?.erasedObjects || 0, ...(metadata.nativeComponentQuality ? { "component-quality-pages-audited": metadata.nativeComponentQuality.pagesAudited, "component-quality-connectors": metadata.nativeComponentQuality.connectors, "component-quality-minimum-unit-crops": metadata.nativeComponentQuality.minimumUnitCrops, "component-quality-evidenced-crops": metadata.nativeComponentQuality.evidencedMinimumUnitCrops, "component-quality-unverified-crops": metadata.nativeComponentQuality.unverifiedMinimumUnitCrops } : {}), ...(requiredReconstructionProfile ? { "production-profile-aligned": metadata.reconstructionProfile === requiredReconstructionProfile ? 1 : 0 } : {}), ...(visualQuality?.metrics || {}) } : {}), ...(!raw && visualVerificationEnabled ? (visualQuality?.metrics || {}) : {}), "pptx-bytes": fs.statSync(outputFile).size } });
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
    } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
  };
}

module.exports = { IMAGE_EXTENSIONS, MAX_DECK_BYTES, createImageToEditableArchiveHandler, readRawImageDimensions, residualDeduplicationStatus, safeAssetPath, validateDeckIr, validateDocumentPackage, validatePackage };
